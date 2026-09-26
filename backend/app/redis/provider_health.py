from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel


FailureCategory = Literal['timeout', 'rate_limit', 'quota', 'unavailable', 'model_unavailable', 'unknown']


class ProviderHealth(BaseModel):
    available: bool
    cooldown: bool = False
    failure_category: FailureCategory | None = None
    last_failure_at: str | None = None


class ProviderHealthStore:
    def __init__(self, redis, ttl_seconds: int = 900, namespace: str = 'flowcv:ai:provider') -> None:
        if ttl_seconds < 1:
            raise ValueError('Provider health TTL must be positive')
        self._redis = redis
        self._ttl_seconds = ttl_seconds
        self._namespace = namespace

    async def get(self, provider: str) -> ProviderHealth:
        value = await self._redis.get(self._key(provider))
        if value is None:
            return ProviderHealth(available=True)
        try:
            return ProviderHealth.model_validate_json(value)
        except ValueError:
            await self._redis.delete(self._key(provider))
            return ProviderHealth(available=True)

    async def record_failure(self, provider: str, category: FailureCategory, cooldown_seconds: int) -> ProviderHealth:
        health = ProviderHealth(
            available=False,
            cooldown=cooldown_seconds > 0,
            failure_category=category,
            last_failure_at=datetime.now(UTC).isoformat(),
        )
        ttl = max(1, min(cooldown_seconds or self._ttl_seconds, self._ttl_seconds))
        await self._redis.set(self._key(provider), health.model_dump_json(), ex=ttl)
        return health

    async def record_success(self, provider: str) -> None:
        await self._redis.delete(self._key(provider))

    def _key(self, provider: str) -> str:
        return f'{self._namespace}:{provider}'