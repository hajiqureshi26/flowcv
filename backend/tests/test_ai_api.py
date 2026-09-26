from __future__ import annotations

from asyncio import run

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.ai.orchestrator import AIOrchestrator
from app.ai.providers.base import ProviderOutput
from app.ai.router import get_ai_orchestrator
from app.ai.schemas import JDAnalysisResult
from app.ai.security import actor_fingerprint
from app.config.settings import Settings
from app.main import app
from test_redis import FakeRedis


class FakeManager:
    async def generate(self, _task) -> ProviderOutput:
        return ProviderOutput(JDAnalysisResult(job_title='Product Engineer', required_skills=['Python']), 'gemini', 'mock-model', False)


def test_jd_endpoint_uses_orchestrator_and_returns_structured_result() -> None:
    service = AIOrchestrator(FakeRedis(), Settings(_env_file=None), FakeManager())
    app.dependency_overrides[get_ai_orchestrator] = lambda: service
    try:
        response = TestClient(app).post('/api/ai/jd/analyze', json={'job_description': 'We need a Product Engineer who knows Python.'})
    finally:
        app.dependency_overrides.pop(get_ai_orchestrator, None)

    assert response.status_code == 200
    assert response.json()['result']['job_title'] == 'Product Engineer'
    assert response.json()['provider'] == {'name': 'gemini', 'model': 'mock-model', 'fallback_used': False, 'cached': False}


def test_ai_endpoint_returns_429_with_retry_after_and_structured_validation_error() -> None:
    settings = Settings(_env_file=None, AI_REQUESTS_PER_MINUTE=1)
    service = AIOrchestrator(FakeRedis(), settings, FakeManager())
    app.dependency_overrides[get_ai_orchestrator] = lambda: service
    try:
        client = TestClient(app)
        first = client.post('/api/ai/jd/analyze', json={'job_description': 'We need a Product Engineer who knows Python.'})
        limited = client.post('/api/ai/jd/analyze', json={'job_description': 'We need a Product Engineer who knows Python.'})
        invalid = client.post('/api/ai/jd/analyze', json={'job_description': ''})
    finally:
        app.dependency_overrides.pop(get_ai_orchestrator, None)

    assert first.status_code == 200
    assert limited.status_code == 429
    assert limited.headers['retry-after'] == '60'
    assert limited.json()['error']['code'] == 'rate_limited'
    assert invalid.status_code == 422
    assert invalid.json()['error']['code'] == 'validation_error'


def test_rate_limited_response_exposes_retry_after_to_browser_clients() -> None:
    settings = Settings(_env_file=None, AI_REQUESTS_PER_MINUTE=1)
    service = AIOrchestrator(FakeRedis(), settings, FakeManager())
    app.dependency_overrides[get_ai_orchestrator] = lambda: service
    try:
        client = TestClient(app)
        headers = {'Origin': 'http://localhost:3000'}
        client.post('/api/ai/jd/analyze', json={'job_description': 'We need a Product Engineer who knows Python.'}, headers=headers)
        limited = client.post('/api/ai/jd/analyze', json={'job_description': 'We need a Product Engineer who knows Python.'}, headers=headers)
    finally:
        app.dependency_overrides.pop(get_ai_orchestrator, None)

    assert limited.status_code == 429
    assert 'retry-after' in limited.headers['access-control-expose-headers'].lower()


def test_anonymous_fingerprint_ignores_untrusted_forwarded_headers_and_hashes_ip() -> None:
    def request(peer: str, forwarded: str) -> Request:
        scope = {
            'type': 'http',
            'http_version': '1.1',
            'method': 'POST',
            'scheme': 'http',
            'path': '/api/ai/jd/analyze',
            'raw_path': b'/api/ai/jd/analyze',
            'query_string': b'',
            'headers': [(b'x-forwarded-for', forwarded.encode())],
            'client': (peer, 1234),
            'server': ('localhost', 8000),
        }
        return Request(scope)

    settings = Settings(_env_file=None, AI_IDENTITY_SECRET='test-hmac-secret', TRUSTED_PROXY_COUNT=1, TRUSTED_PROXY_HOSTS=['10.0.0.0/8'])
    first = actor_fingerprint(request('198.51.100.7', '203.0.113.8'), settings)
    spoofed = actor_fingerprint(request('198.51.100.7', '192.0.2.10'), settings)
    trusted_forwarded = actor_fingerprint(request('10.0.0.8', '203.0.113.8'), settings)

    assert first == spoofed
    assert first != '198.51.100.7'
    assert trusted_forwarded != actor_fingerprint(request('10.0.0.8', '192.0.2.10'), settings)