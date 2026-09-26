from __future__ import annotations

import httpx
from pydantic import BaseModel

from app.ai.agents.base import AgentTask
from app.ai.providers.base import AIProviderError, classify_status, parse_structured_response


class GeminiProvider:
    name = 'gemini'
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

    def __init__(self, api_key: str | None, model: str, timeout_seconds: float = 30, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._api_key = api_key
        self.model = model
        self._timeout = timeout_seconds
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def generate(self, task: AgentTask) -> BaseModel:
        if not self._api_key:
            raise AIProviderError('unavailable', self.name)
        url = self.endpoint.format(model=self.model)
        payload = {
            'systemInstruction': {'parts': [{'text': task.system_prompt}]},
            'contents': [{'role': 'user', 'parts': [{'text': task.user_prompt}]}],
            'generationConfig': {
                'responseMimeType': 'application/json',
                'responseSchema': task.response_model.model_json_schema(),
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(url, params={'key': self._api_key}, json=payload)
        except httpx.TimeoutException as exc:
            raise AIProviderError('timeout', self.name) from exc
        except httpx.RequestError as exc:
            raise AIProviderError('unavailable', self.name) from exc

        if response.is_error:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = None
            raise AIProviderError(classify_status(response.status_code, error_payload), self.name)
        try:
            data = response.json()
            content = ''.join(part.get('text', '') for part in data['candidates'][0]['content']['parts'])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AIProviderError('invalid_response', self.name) from exc
        return parse_structured_response(self.name, task.response_model, content)