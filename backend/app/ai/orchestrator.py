from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ValidationError

from app.ai.agents import ATSAgent, JDAnalyzerAgent, ResumeAgent, TailoringAgent
from app.ai.agents.base import Agent, AgentTask
from app.ai.providers.base import AIProviderError, ProviderOutput
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.manager import ProviderManager
from app.ai.providers.openrouter import OpenRouterProvider
from app.ai.schemas import (
    AIResponse,
    ATSAnalysisRequest,
    ATSAnalysisResult,
    JDAnalysisRequest,
    JDAnalysisResult,
    ProviderMetadata,
    ResumeImproveRequest,
    ResumeImproveResult,
    TailoringRequest,
    TailoringResult,
)
from app.config.settings import Settings
from app.redis.cache import RedisCache
from app.redis.provider_health import ProviderHealthStore
from app.redis.rate_limit import RateLimitExceeded, RateWindow, RedisRateLimiter
from app.schemas.resume import Resume


class AIServiceError(Exception):
    def __init__(self, code: str, status_code: int, message: str, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.message = message
        self.retry_after = retry_after


class AIOrchestrator:
    STRUCTURAL_KEYS = frozenset({'type', 'attrs', 'marks', 'id'})

    def __init__(self, redis, settings: Settings, provider_manager: ProviderManager | None = None) -> None:
        self._settings = settings
        self._redis = redis
        self._limiter = RedisRateLimiter(redis)
        self._cache = RedisCache(redis, settings.ai_cache_ttl_seconds)
        self._health = ProviderHealthStore(redis, settings.ai_provider_health_ttl_seconds)
        timeout = settings.ai_request_timeout_seconds
        self._providers = provider_manager or ProviderManager(
            GeminiProvider(settings.gemini_api_key, settings.gemini_model, timeout_seconds=timeout),
            OpenRouterProvider(
                settings.openrouter_api_key,
                settings.openrouter_model,
                site_url=settings.openrouter_site_url,
                app_name=settings.openrouter_app_name,
                timeout_seconds=timeout,
            ),
            self._health,
            settings.ai_provider_cooldown_seconds,
        )
        self._agents: dict[str, Agent] = {
            'resume_improve': ResumeAgent(),
            'jd_analyze': JDAnalyzerAgent(),
            'ats_analyze': ATSAgent(),
            'tailor': TailoringAgent(),
        }

    async def improve_resume(self, request: ResumeImproveRequest, actor: str) -> AIResponse[ResumeImproveResult]:
        return await self._execute('resume_improve', request, actor, ResumeImproveResult)

    async def analyze_jd(self, request: JDAnalysisRequest, actor: str) -> AIResponse[JDAnalysisResult]:
        return await self._execute('jd_analyze', request, actor, JDAnalysisResult)

    async def analyze_ats(self, request: ATSAnalysisRequest, actor: str) -> AIResponse[ATSAnalysisResult]:
        return await self._execute('ats_analyze', request, actor, ATSAnalysisResult)

    async def tailor_resume(self, request: TailoringRequest, actor: str) -> AIResponse[TailoringResult]:
        return await self._execute('tailor', request, actor, TailoringResult)

    async def _execute(self, operation: str, request: BaseModel, actor: str, result_type: type[BaseModel]):
        self._validate_input(request)
        if self._settings.ai_rate_limit_enabled:
            try:
                await self._limiter.check(actor, operation, self._rate_windows(operation))
            except RateLimitExceeded as exc:
                raise AIServiceError(
                    'rate_limited',
                    429,
                    'AI request limit reached. Try again after the indicated delay.',
                    retry_after=exc.retry_after_seconds,
                ) from exc

        agent = self._agents[operation]
        task = agent.build_task(request)
        cache_key = self._cache_key(actor, operation, request)
        if self._settings.ai_cache_enabled and task.cacheable:
            cached = await self._cache.get(cache_key)
            if cached is not None:
                return self._cached_response(cached, result_type)

        try:
            provider_output = await self._providers.generate(task)
            result = result_type.model_validate(provider_output.data.model_dump(mode='json'))
            self._validate_result(operation, request, result)
        except ValidationError as exc:
            raise AIServiceError('invalid_ai_response', 502, 'AI provider returned an invalid structured response') from exc
        except AIProviderError as exc:
            code, status, message = self._provider_error(exc)
            raise AIServiceError(code, status, message) from exc

        output_bytes = self._json_size(result)
        if output_bytes > self._settings.ai_max_output_chars:
            raise AIServiceError('invalid_ai_response', 502, 'AI provider response exceeded the configured output limit')

        response = self._response(result, provider_output, cached=False)
        if self._settings.ai_cache_enabled and task.cacheable:
            await self._cache.set(cache_key, response.model_dump(mode='json'))
        return response

    def _validate_input(self, request: BaseModel) -> None:
        if self._json_size(request) > self._settings.ai_max_request_bytes:
            raise AIServiceError('request_too_large', 413, 'AI request exceeds the configured size limit')
        resume = getattr(request, 'resume', None)
        if isinstance(resume, Resume):
            serialized = self._json_size(resume)
            if serialized > self._settings.ai_max_resume_bytes:
                raise AIServiceError('resume_too_large', 413, 'Resume exceeds the configured AI input limit')
            resume_text = self._resume_text(resume)
            if len(resume_text) > self._settings.ai_max_resume_text_chars:
                raise AIServiceError('resume_text_too_large', 413, 'Resume text exceeds the configured AI input limit')
        job_description = getattr(request, 'job_description', None)
        if isinstance(job_description, str) and len(job_description) > self._settings.ai_max_jd_chars:
            raise AIServiceError('job_description_too_large', 413, 'Job description exceeds the configured input limit')
        selected_content = getattr(request, 'content', None)
        if isinstance(request, ResumeImproveRequest) and isinstance(selected_content, str):
            section_text = self._section_text(request.resume, request.section)
            if self._normalize(selected_content) not in self._normalize(section_text):
                raise AIServiceError('validation_error', 422, 'Selected text must come from the specified resume section')

    def _validate_result(self, operation: str, request: BaseModel, result: BaseModel) -> None:
        if isinstance(result, ResumeImproveResult) and isinstance(request, ResumeImproveRequest):
            if result.original != request.content:
                raise AIServiceError('invalid_ai_response', 502, 'AI provider did not preserve the selected original text')
        if isinstance(result, TailoringResult) and isinstance(request, TailoringRequest):
            if len(result.suggestions) > self._settings.ai_max_operations:
                raise AIServiceError('invalid_ai_response', 502, 'AI provider returned too many suggestions')
            resume_text = self._normalize(self._resume_text(request.resume))
            job_description = self._normalize(request.job_description)
            for suggestion in result.suggestions:
                if self._normalize(suggestion.original_content) not in resume_text:
                    raise AIServiceError('invalid_ai_response', 502, 'A tailoring suggestion does not match supplied resume content')
                if self._normalize(suggestion.supporting_requirement) not in job_description:
                    raise AIServiceError('invalid_ai_response', 502, 'A tailoring suggestion lacks a matching job requirement')
                if suggestion.entry_id and not self._entry_exists(request.resume, suggestion.section, suggestion.entry_id):
                    raise AIServiceError('invalid_ai_response', 502, 'A tailoring suggestion references an unknown resume entry')

    def _rate_windows(self, operation: str) -> list[RateWindow]:
        windows = [
            RateWindow('minute', self._settings.ai_requests_per_minute, 60),
            RateWindow('hour', self._settings.ai_requests_per_hour, 3600),
        ]
        operation_limits = {
            'jd_analyze': ('jd_hour', self._settings.ai_jd_analysis_per_hour),
            'ats_analyze': ('ats_hour', self._settings.ai_ats_analysis_per_hour),
            'tailor': ('tailoring_hour', self._settings.ai_tailoring_per_hour),
        }
        if operation in operation_limits:
            name, limit = operation_limits[operation]
            windows.append(RateWindow(name, limit, 3600))
        return windows

    def _cache_key(self, actor: str, operation: str, request: BaseModel) -> str:
        input_data = {
            'request': request.model_dump(mode='json'),
            'models': [self._settings.gemini_model, self._settings.openrouter_model],
        }
        return self._cache.key_for(actor, operation, input_data, self._settings.ai_prompt_version)

    def _cached_response(self, value: Any, result_type: type[BaseModel]):
        try:
            result = result_type.model_validate(value['result'])
            metadata = ProviderMetadata.model_validate(value['provider'])
            return AIResponse[result_type](result=result, provider=metadata.model_copy(update={'cached': True}))
        except (KeyError, TypeError, ValidationError) as exc:
            raise AIServiceError('invalid_ai_response', 502, 'Cached AI response failed validation') from exc

    @staticmethod
    def _response(result: BaseModel, provider: ProviderOutput, cached: bool):
        metadata = ProviderMetadata(
            name=provider.provider,
            model=provider.model,
            fallback_used=provider.fallback_used,
            cached=cached,
        )
        return AIResponse[type(result)](result=result, provider=metadata)

    @staticmethod
    def _provider_error(error: AIProviderError) -> tuple[str, int, str]:
        mapping = {
            'timeout': ('provider_timeout', 504, 'AI provider timed out'),
            'rate_limit': ('provider_unavailable', 503, 'AI provider is temporarily rate limited'),
            'quota': ('quota_exhausted', 503, 'AI provider quota is temporarily unavailable'),
            'unavailable': ('provider_unavailable', 503, 'AI providers are temporarily unavailable'),
            'model_unavailable': ('model_unavailable', 503, 'Configured AI model is unavailable'),
            'invalid_response': ('invalid_ai_response', 502, 'AI provider returned an invalid structured response'),
            'invalid_request': ('ai_service_error', 502, 'AI provider rejected the processed request'),
        }
        return mapping.get(error.category, mapping['unavailable'])

    @classmethod
    def _resume_text(cls, resume: Resume) -> str:
        return cls._flatten(resume.model_dump(mode='python'))

    @classmethod
    def _section_text(cls, resume: Resume, section: str) -> str:
        return cls._flatten(getattr(resume, section))

    @classmethod
    def _flatten(cls, value: Any) -> str:
        """Render resume content as plain text.

        Structural rich-text keys (``type``/``attrs``/``marks``) and entry ids are
        control data, not resume content, so they are excluded. The frontend
        mirrors this function in ``frontend/ai/text.ts`` so the text a user
        selects is exactly the text validated here.
        """
        if hasattr(value, 'model_dump'):
            value = value.model_dump(mode='python')
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return ' '.join(
                cls._flatten(item) for key, item in value.items() if key not in cls.STRUCTURAL_KEYS
            )
        if isinstance(value, (list, tuple)):
            return ' '.join(cls._flatten(item) for item in value)
        if value is None or isinstance(value, (int, float, bool)):
            return ''
        return ''

    @staticmethod
    def _normalize(value: str) -> str:
        return re.sub(r'\s+', ' ', value).strip().casefold()

    @staticmethod
    def _entry_exists(resume: Resume, section: str, entry_id: str) -> bool:
        if section == 'profile':
            return False
        return any(entry.id == entry_id for entry in getattr(resume, section))

    @staticmethod
    def _json_size(value: BaseModel) -> int:
        return len(json.dumps(value.model_dump(mode='json'), ensure_ascii=False, separators=(',', ':')).encode('utf-8'))