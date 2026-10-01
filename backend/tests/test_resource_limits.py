from __future__ import annotations

import asyncio
from threading import BoundedSemaphore, Event, Thread
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import imports as imports_api
from app.ai import orchestrator as orchestrator_module
from app.ai.orchestrator import AIOrchestrator, AIServiceError
from app.ai.providers.base import ProviderOutput
from app.ai.schemas import ResumeImproveRequest, ResumeImproveResult
from app.config.settings import Settings
from app.schemas.resume import Resume, RichText
from app.services.pdf_service import PDFService
from test_redis import FakeRedis


def minimal_resume() -> Resume:
    return Resume.model_validate({
        'id': 'load-fixture',
        'updatedAt': '2026-10-01T00:00:00Z',
        'personal': {'name': 'Test Candidate'},
        'profile': {'type': 'doc', 'content': []},
    })


def test_pdf_renderer_bounds_concurrent_browser_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PDFService()
    service._render_slots = BoundedSemaphore(1)
    monkeypatch.setattr('app.services.pdf_service.get_settings', lambda: SimpleNamespace(pdf_max_concurrent_renders=1, pdf_render_queue_timeout_seconds=0.05, pdf_render_timeout_ms=100))
    monkeypatch.setattr(service, '_build_resume_html', lambda *_: '<html></html>')
    started = Event()
    release = Event()
    result: list[bytes] = []

    def slow_render(_: str, __: int) -> bytes:
        started.set()
        assert release.wait(timeout=2)
        return b'%PDF-test'

    monkeypatch.setattr(service, '_render_html_to_pdf', slow_render)
    worker = Thread(target=lambda: result.append(service.render_resume_pdf(minimal_resume())))
    worker.start()
    assert started.wait(timeout=2)
    with pytest.raises(HTTPException) as busy:
        service.render_resume_pdf(minimal_resume())
    assert busy.value.status_code == 503
    assert busy.value.headers == {'Retry-After': '2'}
    release.set()
    worker.join(timeout=2)
    assert result == [b'%PDF-test']
    assert service._render_slots.acquire(blocking=False)
    service._render_slots.release()


def test_import_parser_runs_off_event_loop_and_rejects_when_capacity_is_full(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(imports_api, '_import_slots', BoundedSemaphore(1))
    started = Event()
    release = Event()
    monkeypatch.setattr(imports_api.import_service, 'import_from_pdf', lambda _: (started.set(), release.wait(timeout=2), minimal_resume())[-1])

    async def scenario() -> None:
        task = asyncio.create_task(imports_api._parse_import(b'%PDF-fake', 'pdf'))
        await asyncio.to_thread(started.wait, 2)
        with pytest.raises(HTTPException) as busy:
            await imports_api._parse_import(b'%PDF-fake', 'pdf')
        assert busy.value.status_code == 503
        release.set()
        assert (await task).id == 'load-fixture'

    asyncio.run(scenario())


def test_stage_six_resource_limits_have_safe_defaults() -> None:
    settings = Settings(_env_file=None)
    assert settings.pdf_max_concurrent_renders == 2
    assert settings.import_max_concurrent_jobs == 3
    assert settings.ai_max_concurrent_provider_requests == 4


def test_ai_provider_capacity_is_process_wide_and_returns_retry_after(monkeypatch: pytest.MonkeyPatch) -> None:
    class SlowProvider:
        def __init__(self) -> None:
            self.started = Event()
            self.release = Event()

        async def generate(self, _task) -> ProviderOutput:
            self.started.set()
            await asyncio.to_thread(self.release.wait, 2)
            return ProviderOutput(ResumeImproveResult(original='Product engineer', suggested='Experienced product engineer', rationale='Clearer wording.'), 'gemini', 'test', False)

    async def scenario() -> None:
        provider = SlowProvider()
        monkeypatch.setattr(orchestrator_module, '_provider_slots', BoundedSemaphore(1))
        settings = Settings(_env_file=None, AI_RATE_LIMIT_ENABLED=False, AI_CACHE_ENABLED=False)
        service = AIOrchestrator(FakeRedis(), settings, provider)
        resume = minimal_resume()
        resume.profile = RichText.model_validate({'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Product engineer'}]}]})
        payload = ResumeImproveRequest(resume=resume, section='profile', content='Product engineer')

        first = asyncio.create_task(service.improve_resume(payload, 'actor'))
        await asyncio.to_thread(provider.started.wait, 2)
        with pytest.raises(AIServiceError) as busy:
            await service.improve_resume(payload, 'actor')
        assert busy.value.status_code == 503
        assert busy.value.code == 'ai_overloaded'
        assert busy.value.retry_after == 2
        provider.release.set()
        assert (await first).result.suggested == 'Experienced product engineer'
        assert orchestrator_module._provider_slots.acquire(blocking=False)
        orchestrator_module._provider_slots.release()

    asyncio.run(scenario())
