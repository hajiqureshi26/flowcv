from __future__ import annotations

import asyncio

import pytest

from app.ai.orchestrator import AIOrchestrator, AIServiceError
from app.ai.providers.base import ProviderOutput
from app.ai.schemas import (
    ATSAnalysisResult,
    JDAnalysisRequest,
    JDAnalysisResult,
    ResumeImproveRequest,
    ResumeImproveResult,
    TailoringRequest,
    TailoringResult,
    TailoringSuggestion,
)
from app.config.settings import Settings
from app.schemas.resume import Resume
from test_redis import FakeRedis


class FakeManager:
    def __init__(self, result) -> None:
        self.result = result
        self.calls = 0

    async def generate(self, _task) -> ProviderOutput:
        self.calls += 1
        result = self.result() if callable(self.result) else self.result
        return ProviderOutput(result, 'gemini', 'mock-model', False)


def sample_resume() -> Resume:
    return Resume.model_validate({
        'id': 'orchestrator-resume',
        'updatedAt': '2026-09-27T00:00:00Z',
        'personal': {'name': 'Jordan Lee'},
        'profile': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Product engineer with delivery experience.'}]}]},
        'experience': [{'id': 'exp-1', 'title': 'Engineer', 'company': 'Example Co', 'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Led platform work.'}]}]}}],
    })


def test_orchestrator_caches_per_actor_and_validates_resume_suggestions() -> None:
    async def check() -> None:
        provider = FakeManager(ResumeImproveResult(original='Product engineer', suggested='Product engineer with delivery experience', rationale='Adds supplied context.'))
        service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), provider)
        request = ResumeImproveRequest(resume=sample_resume(), section='profile', content='Product engineer')

        first = await service.improve_resume(request, 'actor-a')
        repeated = await service.improve_resume(request, 'actor-a')
        other_actor = await service.improve_resume(request, 'actor-b')

        assert first.result.suggested.startswith('Product engineer')
        assert not first.provider.cached and repeated.provider.cached
        assert not other_actor.provider.cached
        assert provider.calls == 2

    asyncio.run(check())


def test_orchestrator_rejects_unselected_resume_text_and_oversized_jd_before_provider() -> None:
    async def check() -> None:
        provider = FakeManager(ResumeImproveResult(original='unsupported', suggested='changed'))
        service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), provider)
        invalid_selection = ResumeImproveRequest(resume=sample_resume(), section='profile', content='Made up detail')
        with pytest.raises(AIServiceError) as selection_error:
            await service.improve_resume(invalid_selection, 'actor')
        assert selection_error.value.code == 'validation_error'

        small_settings = Settings(_env_file=None, AI_MAX_JD_CHARS=8)
        jd_service = AIOrchestrator(FakeRedis(), small_settings, provider)
        with pytest.raises(AIServiceError) as size_error:
            await jd_service.analyze_jd(JDAnalysisRequest(job_description='A role that is too long'), 'actor')
        assert size_error.value.status_code == 413
        assert provider.calls == 0

    asyncio.run(check())


def test_orchestrator_applies_rate_limit_before_cache_or_provider() -> None:
    async def check() -> None:
        settings = Settings(_env_file=None, AI_RATE_LIMIT_ENABLED=True, AI_REQUESTS_PER_MINUTE=1)
        provider = FakeManager(JDAnalysisResult(job_title='Engineer'))
        service = AIOrchestrator(FakeRedis(), settings, provider)
        await service.analyze_jd(JDAnalysisRequest(job_description='First job description'), 'actor')
        with pytest.raises(AIServiceError) as error:
            await service.analyze_jd(JDAnalysisRequest(job_description='Second job description'), 'actor')
        assert error.value.code == 'rate_limited'
        assert error.value.status_code == 429
        assert error.value.retry_after == 60
        assert provider.calls == 1

    asyncio.run(check())


def test_tailoring_response_must_reference_resume_and_job_description() -> None:
    async def check() -> None:
        valid = TailoringResult(suggestions=[TailoringSuggestion(
            id='suggestion-1',
            section='experience',
            entry_id='exp-1',
            original_content='Led platform work.',
            suggested_content='Led platform work for reliable delivery.',
            reason='Clarifies the supplied responsibility.',
            supporting_requirement='reliable delivery',
        )])
        service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), FakeManager(valid))
        result = await service.tailor_resume(TailoringRequest(resume=sample_resume(), job_description='We value reliable delivery.'), 'actor')
        assert result.result.suggestions[0].entry_id == 'exp-1'

        unsupported = valid.model_copy(update={'suggestions': [valid.suggestions[0].model_copy(update={'supporting_requirement': 'invented requirement'})]})
        bad_service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), FakeManager(unsupported))
        with pytest.raises(AIServiceError) as error:
            await bad_service.tailor_resume(TailoringRequest(resume=sample_resume(), job_description='We value reliable delivery.'), 'actor')
        assert error.value.code == 'invalid_ai_response'

    asyncio.run(check())


def test_resume_text_projection_keeps_facts_and_drops_control_keys() -> None:
    resume = sample_resume()

    assert AIOrchestrator._section_text(resume, 'profile').strip() == 'Product engineer with delivery experience.'
    resume_text = AIOrchestrator._resume_text(resume)
    assert 'Product engineer with delivery experience.' in resume_text
    assert 'Led platform work.' in resume_text
    assert 'paragraph' not in resume_text.split()
    assert 'exp-1' not in resume_text.split()


def test_unselected_text_is_rejected_before_any_provider_call() -> None:
    async def check() -> None:
        provider = FakeManager(ResumeImproveResult(original='requested', suggested='changed'))
        service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), provider)
        request = ResumeImproveRequest(resume=sample_resume(), section='profile', content='Experience I do not have')

        with pytest.raises(AIServiceError) as error:
            await service.improve_resume(request, 'actor')

        assert error.value.code == 'validation_error'
        assert provider.calls == 0

    asyncio.run(check())


def test_ats_operation_uses_structured_result_schema() -> None:
    async def check() -> None:
        result = ATSAnalysisResult(matching_skills=['Python'], actionable_suggestions=['Describe the supplied deployment experience.'])
        service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), FakeManager(result))
        response = await service.analyze_ats(
            __import__('app.ai.schemas', fromlist=['ATSAnalysisRequest']).ATSAnalysisRequest(resume=sample_resume(), job_description='Python required.'),
            'actor',
        )
        assert response.result.matching_skills == ['Python']

    asyncio.run(check())