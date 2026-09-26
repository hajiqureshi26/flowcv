from __future__ import annotations

from dataclasses import dataclass


_INCREMENT_WITH_TTL = '''
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
'''


@dataclass(frozen=True)
class RateWindow:
    name: str
    limit: int
    period_seconds: int


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int, window: str) -> None:
        super().__init__('AI request rate limit exceeded')
        self.retry_after_seconds = max(1, retry_after_seconds)
        self.window = window


class RedisRateLimiter:
    def __init__(self, redis) -> None:
        self._redis = redis

    async def check(self, actor_fingerprint: str, operation: str, windows: list[RateWindow]) -> None:
        for window in windows:
            if window.limit < 1 or window.period_seconds < 1:
                raise ValueError('Rate limit values must be positive')
            key = f'flowcv:ai:rate:{actor_fingerprint}:{operation}:{window.name}'
            count, ttl_ms = await self._redis.eval(
                _INCREMENT_WITH_TTL,
                1,
                key,
                window.period_seconds * 1000,
            )
            if int(count) > window.limit:
                raise RateLimitExceeded((int(ttl_ms) + 999) // 1000, window.name)