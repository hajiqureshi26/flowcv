from __future__ import annotations

from starlette.responses import JSONResponse


class AIRequestSizeLimitMiddleware:
    def __init__(self, app, max_bytes: int) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope['type'] != 'http' or not scope.get('path', '').startswith('/api/ai/'):
            await self._app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get('headers', [])}
        content_length = headers.get(b'content-length')
        if content_length:
            try:
                too_large = int(content_length) > self._max_bytes
            except ValueError:
                too_large = True
            if too_large:
                await self._too_large(scope, receive, send)
                return

        body_parts: list[bytes] = []
        body_size = 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            body_size += len(chunk)
            if body_size > self._max_bytes:
                await self._too_large(scope, receive, send)
                return
            body_parts.append(chunk)
            if not message.get('more_body', False):
                break

        body = b''.join(body_parts)
        replayed = False

        async def replay_receive():
            nonlocal replayed
            if replayed:
                return {'type': 'http.request', 'body': b'', 'more_body': False}
            replayed = True
            return {'type': 'http.request', 'body': body, 'more_body': False}

        await self._app(scope, replay_receive, send)

    @staticmethod
    async def _too_large(scope, receive, send) -> None:
        response = JSONResponse(
            status_code=413,
            content={'error': {'code': 'request_too_large', 'message': 'AI request exceeds the configured size limit'}},
        )
        await response(scope, receive, send)