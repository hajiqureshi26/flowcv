from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Literal, Protocol

from pydantic import BaseModel, ValidationError

from app.ai.agents.base import AgentTask

logger = logging.getLogger(__name__)


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
        issues: list[str] = []
        if isinstance(exc, ValidationError):
            allowed_fields = _schema_field_names(response_model.model_json_schema())
            for error in exc.errors(include_input=False, include_context=False, include_url=False)[:8]:
                path = '.'.join(
                    '#' if isinstance(part, int) else str(part)
                    for part in error.get('loc', ())
                    if isinstance(part, int) or part in allowed_fields
                )
                issues.append(f'{path or "<root>"}:{error.get("type", "validation_error")}')
        else:
            issues.append(type(exc).__name__)
        logger.warning(
            'ai_structured_response_invalid provider=%s response_model=%s issues=%s',
            provider,
            response_model.__name__,
            ','.join(issues),
        )
        raise AIProviderError('invalid_response', provider) from exc


def _schema_field_names(value: object) -> set[str]:
    fields: set[str] = set()
    if isinstance(value, dict):
        properties = value.get('properties')
        if isinstance(properties, dict):
            fields.update(properties)
        for nested in value.values():
            fields.update(_schema_field_names(nested))
    elif isinstance(value, list):
        for nested in value:
            fields.update(_schema_field_names(nested))
    return fields