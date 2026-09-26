from __future__ import annotations

import asyncio
import os
import uuid

import pytest

from app.redis.cache import RedisCache
from app.redis.client import close_redis, get_redis
from app.redis.provider_health import ProviderHealthStore
from app.redis.rate_limit import RateLimitExceeded, RateWindow, RedisRateLimiter

pytestmark = pytest.mark.skipif(
    os.getenv('RUN_LIVE_REDIS') != '1',
    reason='Set RUN_LIVE_REDIS=1 with a reachable REDIS_URL to verify the real Redis primitives',
)


def test_live_redis_rate_limit_cache_ttl_and_provider_health() -> None:
    """Exercises the real Redis server; every key below is temporary and TTL bound."""

    async def check() -> None:
        redis = get_redis()
        namespace = uuid.uuid4().hex
        rate_keys = [f'flowcv:ai:rate:{namespace}:tailor:{name}' for name in ('minute', 'job')]
        provider_key = 'flowcv:ai:provider:gemini'
        cache_key = ''
        try:
            limiter = RedisRateLimiter(redis)
            windows = [RateWindow('minute', 3, 5), RateWindow('job', 1, 5)]

            await limiter.check(namespace, 'tailor', windows)
            with pytest.raises(RateLimitExceeded) as error:
                await limiter.check(namespace, 'tailor', windows)
            assert error.value.window == 'job'
            assert 0 < error.value.retry_after_seconds <= 5

            cache = RedisCache(redis, ttl_seconds=5)
            cache_key = cache.key_for(namespace, 'resume_improve', {'text': 'ephemeral'}, 'v1')
            await cache.set(cache_key, {'suggestion': 'ephemeral value'})
            assert await cache.get(cache_key) == {'suggestion': 'ephemeral value'}
            assert 0 < await redis.ttl(cache_key) <= 5

            health = ProviderHealthStore(redis, ttl_seconds=5)
            await health.record_failure('gemini', 'timeout', cooldown_seconds=5)
            assert not (await health.get('gemini')).available
            assert 0 < await redis.ttl(provider_key) <= 5
            await health.record_success('gemini')
            assert (await health.get('gemini')).available
        finally:
            await redis.delete(*[key for key in [*rate_keys, provider_key, cache_key] if key])
            await close_redis()

    asyncio.run(check())
