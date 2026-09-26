from __future__ import annotations

import asyncio

import httpx
import pytest

from app.ai.agents.base import AgentTask
from app.ai.providers.base import AIProviderError, ProviderOutput
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.manager import ProviderManager
from app.ai.providers.openrouter import OpenRouterProvider
from app.ai.schemas import ResumeImproveResult
from app.redis.provider_health import ProviderHealth


class FakeHealth:
    def __init__(self) -> None:
        self.values: dict[str, ProviderHealth] = {}

    async def get(self, provider: str) -> ProviderHealth:
        return self.values.get(provider, ProviderHealth(available=True))

    async def record_failure(self, provider: str, category: str, cooldown_seconds: int) -> ProviderHealth:
        value = ProviderHealth(available=False, cooldown=True, failure_category=category, last_failure_at='now')
        self.values[provider] = value
        return value

    async def record_success(self, provider: str) -> None:
        self.values.pop(provider, None)


class FakeProvider:
    def __init__(self, name: str, response: ResumeImproveResult | AIProviderError | None, configured: bool = True) -> None:
        self.name = name
        self.model = f'{name}-test-model'
        self.response = response
        self.configured = configured
        self.calls = 0

    async def generate(self, _task: AgentTask) -> ResumeImproveResult:
        self.calls += 1
        if isinstance(self.response, Exception):
            raise self.response
        if self.response is None:
            raise AssertionError('Unconfigured provider must not be called')
        return self.response


def task() -> AgentTask:
    return AgentTask('resume_improve', 'Use supplied facts only.', 'Improve wording.', ResumeImproveResult)


def test_gemini_sends_structured_request_and_validates_json_response() -> None:
    async def check() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.params['key'] == 'server-only-key'
            payload = __import__('json').loads(request.content)
            assert payload['generationConfig']['responseMimeType'] == 'application/json'
            assert payload['generationConfig']['responseSchema']['properties']['suggested']
            return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': '{"original":"x","suggested":"y","rationale":"clearer"}'}]}}]})

        provider = GeminiProvider('server-only-key', 'test-model', transport=httpx.MockTransport(handler))
        result = await provider.generate(task())
        assert result == ResumeImproveResult(original='x', suggested='y', rationale='clearer')

    asyncio.run(check())


def test_openrouter_uses_backend_authorization_and_structured_response() -> None:
    async def check() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers['Authorization'] == 'Bearer backend-key'
            assert request.headers['HTTP-Referer'] == 'https://flowcv.example'
            payload = __import__('json').loads(request.content)
            assert payload['response_format'] == {'type': 'json_object'}
            return httpx.Response(200, json={'choices': [{'message': {'content': '{"original":"x","suggested":"y","rationale":"clearer"}'}}]})

        provider = OpenRouterProvider('backend-key', 'test/model', 'https://flowcv.example', transport=httpx.MockTransport(handler))
        result = await provider.generate(task())
        assert result.suggested == 'y'

    asyncio.run(check())


def test_provider_normalizes_timeout_quota_and_invalid_structured_output() -> None:
    async def check() -> None:
        async def timeout_handler(_request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout('private request context')

        timeout_provider = GeminiProvider('key', 'test-model', transport=httpx.MockTransport(timeout_handler))
        with pytest.raises(AIProviderError) as timeout_error:
            await timeout_provider.generate(task())
        assert timeout_error.value.category == 'timeout'
        assert 'private request context' not in str(timeout_error.value)

        quota_provider = OpenRouterProvider(
            'key', 'test/model', transport=httpx.MockTransport(lambda _: httpx.Response(429, json={'error': {'message': 'Quota exhausted'}})),
        )
        with pytest.raises(AIProviderError) as quota_error:
            await quota_provider.generate(task())
        assert quota_error.value.category == 'quota'

        invalid_provider = GeminiProvider(
            'key', 'test-model', transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'not json'}]}}]})),
        )
        with pytest.raises(AIProviderError) as invalid_error:
            await invalid_provider.generate(task())
        assert invalid_error.value.category == 'invalid_response'

    asyncio.run(check())


def test_manager_falls_back_once_on_temporary_error_and_skips_unconfigured_primary() -> None:
    async def check() -> None:
        expected = ResumeImproveResult(original='x', suggested='y', rationale='clearer')
        primary = FakeProvider('gemini', AIProviderError('timeout', 'gemini'))
        fallback = FakeProvider('openrouter', expected)
        health = FakeHealth()
        manager = ProviderManager(primary, fallback, health)
        output: ProviderOutput = await manager.generate(task())
        assert output.provider == 'openrouter' and output.fallback_used
        assert primary.calls == 1 and fallback.calls == 1
        assert (await health.get('gemini')).cooldown

        no_key_primary = FakeProvider('gemini', None, configured=False)
        second = FakeProvider('openrouter', expected)
        direct_fallback = ProviderManager(no_key_primary, second, FakeHealth())
        direct_output = await direct_fallback.generate(task())
        assert direct_output.provider == 'openrouter' and direct_output.fallback_used
        assert no_key_primary.calls == 0 and second.calls == 1

    asyncio.run(check())


def test_manager_does_not_fallback_for_invalid_user_or_provider_data() -> None:
    async def check() -> None:
        primary = FakeProvider('gemini', AIProviderError('invalid_request', 'gemini'))
        fallback = FakeProvider('openrouter', ResumeImproveResult(original='x', suggested='y'))
        manager = ProviderManager(primary, fallback, FakeHealth())
        with pytest.raises(AIProviderError) as error:
            await manager.generate(task())
        assert error.value.category == 'invalid_request'
        assert primary.calls == 1 and fallback.calls == 0

    asyncio.run(check())