from __future__ import annotations

import hashlib
import json
from typing import Any


class RedisCache:
    def __init__(self, redis, ttl_seconds: int, namespace: str = 'flowcv:ai:cache') -> None:
        if ttl_seconds < 1:
            raise ValueError('Cache TTL must be positive')
        self._redis = redis
        self._ttl_seconds = ttl_seconds
        self._namespace = namespace

    def key_for(self, actor_fingerprint: str, operation: str, input_data: Any, prompt_version: str) -> str:
        canonical = json.dumps(input_data, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=self._json_default)
        fingerprint = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
        identity = hashlib.sha256(actor_fingerprint.encode('utf-8')).hexdigest()
        return f'{self._namespace}:{operation}:{prompt_version}:{identity}:{fingerprint}'

    async def get(self, key: str) -> Any | None:
        value = await self._redis.get(key)
        if value is None:
            return None
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            await self._redis.delete(key)
            return None

    async def set(self, key: str, value: Any) -> None:
        serialized = json.dumps(value, ensure_ascii=False, separators=(',', ':'), default=self._json_default)
        await self._redis.set(key, serialized, ex=self._ttl_seconds)

    @staticmethod
    def _json_default(value: Any) -> Any:
        if hasattr(value, 'model_dump'):
            return value.model_dump(mode='json')
        raise TypeError(f'Unsupported cache value: {type(value).__name__}')