from __future__ import annotations

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.imports import router as imports_router
from app.ai.orchestrator import AIServiceError
from app.ai.router import router as ai_router
from app.api.pdf import router as pdf_router
from app.api.resumes import router as resumes_router
from app.api.templates import router as templates_router
from app.config.settings import get_settings
from app.middleware.ai_request_size import AIRequestSizeLimitMiddleware
from app.redis.client import close_redis, get_redis

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_redis()


app = FastAPI(title='FlowCV Backend', version='0.1.0', lifespan=lifespan)
app.add_middleware(AIRequestSizeLimitMiddleware, max_bytes=settings.ai_max_request_bytes)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    # Retry-After is not a CORS-safelisted response header, so it must be exposed
    # explicitly or the browser frontend cannot show the rate-limit countdown.
    expose_headers=['Retry-After'],
)

app.include_router(resumes_router, prefix='/api')
app.include_router(templates_router, prefix='/api')
app.include_router(pdf_router, prefix='/api')
app.include_router(imports_router, prefix='/api')
app.include_router(ai_router, prefix='/api')


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/health/redis')
async def redis_health() -> dict[str, str]:
    try:
        await get_redis().ping()
    except Exception as exc:
        raise StarletteHTTPException(status_code=503, detail='Redis is unavailable') from exc
    return {'status': 'ok', 'redis': 'ok'}


@app.exception_handler(StarletteHTTPException)
async def http_error(_: object, exc: StarletteHTTPException) -> JSONResponse:
    codes = {400: 'bad_request', 404: 'not_found', 413: 'file_too_large', 415: 'unsupported_media_type', 422: 'validation_error', 503: 'service_unavailable'}
    message = exc.detail if isinstance(exc.detail, str) else 'Request could not be completed'
    return JSONResponse(
        status_code=exc.status_code,
        content={'error': {'code': codes.get(exc.status_code, 'http_error'), 'message': message}},
        headers=exc.headers,
    )


@app.exception_handler(AIServiceError)
async def ai_service_error(_: object, exc: AIServiceError) -> JSONResponse:
    headers = {'Retry-After': str(exc.retry_after)} if exc.retry_after is not None else None
    return JSONResponse(
        status_code=exc.status_code,
        content={'error': {'code': exc.code, 'message': exc.message}},
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_: object, exc: RequestValidationError) -> JSONResponse:
    details = [
        {
            'location': '.'.join(str(part) for part in error.get('loc', ())),
            'message': error.get('msg', 'Invalid value'),
            'type': error.get('type', 'value_error'),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={'error': {'code': 'validation_error', 'message': 'Request validation failed', 'details': details}},
    )


@app.exception_handler(Exception)
async def internal_error(_: object, exc: Exception) -> JSONResponse:
    logger.exception('Unhandled API error', exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={'error': {'code': 'internal_server_error', 'message': 'Internal server error'}},
    )
