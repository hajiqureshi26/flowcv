from __future__ import annotations

import asyncio
import json
import time

from app.redis.cache import RedisCache
from app.redis.provider_health import ProviderHealthStore
from app.redis.rate_limit import RateLimitExceeded, RateWindow, RedisRateLimiter


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, tuple[str, float | None]] = {}

    async def eval(self, _script: str, _key_count: int, key: str, ttl_ms: int) -> list[int]:
        current, expiry = self._read(key)
        count = int(current or 0) + 1
        new_expiry = expiry if current else time.monotonic() + ttl_ms / 1000
        self.values[key] = (str(count), new_expiry)
        return [count, max(0, int(((new_expiry or time.monotonic()) - time.monotonic()) * 1000))]

    async def get(self, key: str) -> str | None:
        value, _ = self._read(key)
        return value

    async def set(self, key: str, value: str, ex: int) -> None:
        self.values[key] = (value, time.monotonic() + ex)

    async def delete(self, key: str) -> int:
        return int(self.values.pop(key, None) is not None)

    def _read(self, key: str) -> tuple[str | None, float | None]:
        item = self.values.get(key)
        if item and item[1] is not None and item[1] <= time.monotonic():
            self.values.pop(key, None)
            return None, None
        return item or (None, None)


def test_rate_limiter_enforces_operation_and_window_limits() -> None:
    async def check() -> None:
        redis = FakeRedis()
        limiter = RedisRateLimiter(redis)
        windows = [RateWindow('minute', 2, 60), RateWindow('tailoring-hour', 1, 3600)]

        await limiter.check('actor-a', 'tailor', windows)
        try:
            await limiter.check('actor-a', 'tailor', windows)
        except RateLimitExceeded as error:
            assert error.window == 'tailoring-hour'
            assert error.retry_after_seconds > 0
        else:
            raise AssertionError('Expected the operation-specific rate limit to reject the second request')

        await limiter.check('actor-b', 'tailor', windows)

    asyncio.run(check())


def test_cache_uses_actor_input_operation_and_prompt_version_scope_and_ttl() -> None:
    async def check() -> None:
        redis = FakeRedis()
        cache = RedisCache(redis, ttl_seconds=30)
        input_data = {'text': 'private resume details'}
        key = cache.key_for('actor-a', 'resume_improve', input_data, 'v1')

        assert key != cache.key_for('actor-b', 'resume_improve', input_data, 'v1')
        assert key != cache.key_for('actor-a', 'jd_analyze', input_data, 'v1')
        assert key != cache.key_for('actor-a', 'resume_improve', input_data, 'v2')
        await cache.set(key, {'suggestion': 'improved wording'})
        assert await cache.get(key) == {'suggestion': 'improved wording'}
        assert redis.values[key][1] is not None

        redis.values[key] = (json.dumps({'stale': True}), time.monotonic() - 1)
        assert await cache.get(key) is None

    asyncio.run(check())


def test_provider_health_cooldown_expires_and_success_clears_state() -> None:
    async def check() -> None:
        redis = FakeRedis()
        store = ProviderHealthStore(redis, ttl_seconds=60)

        assert (await store.get('gemini')).available
        failed = await store.record_failure('gemini', 'timeout', cooldown_seconds=30)
        assert not failed.available and failed.cooldown and failed.failure_category == 'timeout'
        assert (await store.get('gemini')).last_failure_at == failed.last_failure_at

        await store.record_success('gemini')
        assert (await store.get('gemini')).available

        await store.record_failure('openrouter', 'quota', cooldown_seconds=0)
        key = 'flowcv:ai:provider:openrouter'
        redis.values[key] = (redis.values[key][0], time.monotonic() - 1)
        assert (await store.get('openrouter')).available

    asyncio.run(check())