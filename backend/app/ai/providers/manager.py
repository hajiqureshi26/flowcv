from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel

from app.ai.agents.base import AgentTask
from app.ai.providers.base import AIProvider, AIProviderError, ProviderOutput
from app.redis.provider_health import ProviderHealthStore


class ProviderManager:
    def __init__(
        self,
        primary: AIProvider,
        fallback: AIProvider,
        health: ProviderHealthStore,
        cooldown_seconds: int = 60,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._health = health
        self._cooldown_seconds = cooldown_seconds

    async def generate(self, task: AgentTask) -> ProviderOutput:
        providers: Sequence[AIProvider] = (self._primary, self._fallback)
        last_error: AIProviderError | None = None
        fallback_used = False

        for index, provider in enumerate(providers):
            if index == 1:
                fallback_used = True
                if last_error is not None and not (last_error.retryable or last_error.category == 'invalid_request'):
                    break
            if not provider.configured:
                continue
            health = await self._health.get(provider.name)
            if health.cooldown:
                last_error = AIProviderError(health.failure_category or 'unavailable', provider.name)
                continue
            try:
                result = await provider.generate(task)
                validated = task.response_model.model_validate(result.model_dump())
                await self._health.record_success(provider.name)
                return ProviderOutput(validated, provider.name, provider.model, fallback_used)
            except AIProviderError as error:
                last_error = error
                if error.retryable:
                    await self._health.record_failure(
                        provider.name,
                        error.category,
                        self._cooldown_seconds,
                    )
                elif error.category != 'invalid_request':
                    break
            except Exception as exc:
                last_error = AIProviderError('unavailable', provider.name)
                await self._health.record_failure(provider.name, 'unavailable', self._cooldown_seconds)
                if index == 1:
                    raise last_error from exc

        if last_error is None:
            raise AIProviderError('unavailable', 'none')
        raise last_error