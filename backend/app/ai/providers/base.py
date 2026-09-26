from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel

from app.ai.agents.base import AgentTask


ProviderFailure = Literal['timeout', 'rate_limit', 'quota', 'unavailable', 'model_unavailable', 'invalid_response', 'invalid_request']


class AIProviderError(Exception):
    def __init__(self, category: ProviderFailure, provider: str) -> None:
        super().__init__(category)
        self.category = category
        self.provider = provider

    @property
    def retryable(self) -> bool:
        return self.category in {'timeout', 'rate_limit', 'quota', 'unavailable', 'model_unavailable'}


@dataclass(frozen=True)
class ProviderOutput:
    data: BaseModel
    provider: str
    model: str
    fallback_used: bool
    cached: bool = False


class AIProvider(Protocol):
    name: str
    model: str

    @property
    def configured(self) -> bool: ...

    async def generate(self, task: AgentTask) -> BaseModel: ...


def classify_status(status_code: int, error_payload: object) -> ProviderFailure:
    text = ''
    if isinstance(error_payload, dict):
        error = error_payload.get('error', error_payload)
        if isinstance(error, dict):
            text = f"{error.get('status', '')} {error.get('code', '')} {error.get('message', '')}".lower()
    if status_code == 429:
        return 'quota' if 'quota' in text or 'exhaust' in text else 'rate_limit'
    if status_code in {408, 504}:
        return 'timeout'
    if status_code == 404 or 'model not found' in text or 'model_unavailable' in text:
        return 'model_unavailable'
    if status_code >= 500:
        return 'unavailable'
    return 'invalid_request'


def parse_structured_response(provider: str, response_model: type[BaseModel], content: str) -> BaseModel:
    try:
        return response_model.model_validate_json(content)
    except Exception as exc:
        raise AIProviderError('invalid_response', provider) from exc