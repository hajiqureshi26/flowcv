"""Exercise the AI HTTP route with an in-process mock provider (no Redis/network/provider calls)."""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from statistics import median
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.ai import orchestrator as orchestrator_module
from app.ai.orchestrator import AIOrchestrator, AIServiceError
from app.ai.providers.base import ProviderOutput
from app.ai.router import get_ai_orchestrator, router as ai_router
from app.ai.schemas import ResumeImproveResult
from app.config.settings import Settings


class MockProviderManager:
    def __init__(self, latency_seconds: float) -> None:
        self.latency_seconds = latency_seconds
        self.active = 0
        self.max_active = 0

    async def generate(self, _task) -> ProviderOutput:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(self.latency_seconds)
            data = ResumeImproveResult(
                original='Product engineer with delivery experience.',
                suggested='Product engineer with a record of reliable delivery.',
                rationale='Mock response used for local concurrency testing.',
            )
            return ProviderOutput(data, 'gemini', 'stage6-mock', False)
        finally:
            self.active -= 1


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, int(len(ordered) * fraction + .999) - 1))]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--concurrency', type=int, nargs='+', default=[10, 25, 50])
    parser.add_argument('--provider-limit', type=int, default=4)
    parser.add_argument('--mock-latency-ms', type=int, default=100)
    args = parser.parse_args()
    if any(value < 1 or value > 100 for value in args.concurrency) or not 1 <= args.provider_limit <= 50 or not 1 <= args.mock_latency_ms <= 5000:
        parser.error('concurrency must be 1..100, provider limit 1..50, mock latency 1..5000 ms')

    mock = MockProviderManager(args.mock_latency_ms / 1000)
    settings = Settings(_env_file=None, AI_RATE_LIMIT_ENABLED=False, AI_CACHE_ENABLED=False)
    service = AIOrchestrator(object(), settings, mock)
    app = FastAPI()
    app.include_router(ai_router, prefix='/api')
    app.dependency_overrides[get_ai_orchestrator] = lambda: service

    @app.exception_handler(AIServiceError)
    async def ai_error_handler(_request: Request, exc: AIServiceError) -> JSONResponse:
        headers = {'Retry-After': str(exc.retry_after)} if exc.retry_after is not None else None
        return JSONResponse(status_code=exc.status_code, content={'error': {'code': exc.code, 'message': exc.message}}, headers=headers)

    orchestrator_module._provider_slots = __import__('threading').BoundedSemaphore(args.provider_limit)
    payload = {
        'resume': {
            'id': 'stage6-ai-load', 'updatedAt': '2026-10-01T00:00:00Z',
            'personal': {'name': 'Synthetic Load Test'},
            'profile': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Product engineer with delivery experience.'}]}]},
        },
        'section': 'profile', 'content': 'Product engineer with delivery experience.',
    }

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://stage6.local') as client:
        for concurrency in args.concurrency:
            started = time.perf_counter()

            async def request_once() -> tuple[int, float]:
                request_started = time.perf_counter()
                response = await client.post('/api/ai/resume/improve', json=payload)
                return response.status_code, (time.perf_counter() - request_started) * 1000

            results = await asyncio.gather(*(request_once() for _ in range(concurrency)))
            elapsed = time.perf_counter() - started
            counts = Counter(status for status, _ in results)
            latencies = [duration for _, duration in results]
            accepted = [duration for status, duration in results if status == 200]
            print({
                'simultaneous_http_requests': concurrency,
                'provider_limit': args.provider_limit,
                'provider_max_observed_in_flight': mock.max_active,
                'mock_latency_ms': args.mock_latency_ms,
                'responses': dict(counts),
                'expected_overload_503': counts.get(503, 0),
                'elapsed_ms': round(elapsed * 1000, 1),
                'throughput_rps': round(concurrency / elapsed, 2),
                'accepted_latency_ms': {
                    'p50': round(median(accepted), 1) if accepted else None,
                    'p95': round(percentile(accepted, .95), 1) if accepted else None,
                    'p99': round(percentile(accepted, .99), 1) if accepted else None,
                },
                'all_response_latency_ms': {
                    'p50': round(median(latencies), 1),
                    'p95': round(percentile(latencies, .95), 1),
                    'p99': round(percentile(latencies, .99), 1),
                },
            })
            expected_ok = min(concurrency, args.provider_limit)
            if counts.get(200, 0) != expected_ok or counts.get(503, 0) != concurrency - expected_ok:
                raise RuntimeError(f'unexpected saturation result at concurrency {concurrency}: {dict(counts)}')


if __name__ == '__main__':
    asyncio.run(main())
