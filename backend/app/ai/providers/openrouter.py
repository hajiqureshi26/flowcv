from __future__ import annotations

import httpx
from pydantic import BaseModel

from app.ai.agents.base import AgentTask
from app.ai.providers.base import AIProviderError, classify_status, parse_structured_response


class OpenRouterProvider:
    name = 'openrouter'
    endpoint = 'https://openrouter.ai/api/v1/chat/completions'

    def __init__(
        self,
        api_key: str | None,
        model: str,
        site_url: str = 'http://localhost:3000',
        app_name: str = 'FlowCV',
        timeout_seconds: float = 30,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._site_url = site_url
        self._app_name = app_name
        self._timeout = timeout_seconds
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def generate(self, task: AgentTask) -> BaseModel:
        if not self._api_key:
            raise AIProviderError('unavailable', self.name)
        headers = {
            'Authorization': f'Bearer {self._api_key}',
            'HTTP-Referer': self._site_url,
            'X-Title': self._app_name,
        }
        payload = {
            'model': self.model,
            'messages': [
                {'role': 'system', 'content': task.system_prompt},
                {'role': 'user', 'content': task.user_prompt},
            ],
            'response_format': {'type': 'json_object'},
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(self.endpoint, headers=headers, json=payload)
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
            content = response.json()['choices'][0]['message']['content']
            if not isinstance(content, str):
                raise TypeError('Expected JSON response text')
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AIProviderError('invalid_response', self.name) from exc
        return parse_structured_response(self.name, task.response_model, content)