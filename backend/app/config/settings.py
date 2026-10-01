from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', case_sensitive=False, extra='ignore', populate_by_name=True)

    app_env: str = Field(default='development', validation_alias='APP_ENV')
    api_host: str = Field(default='0.0.0.0', validation_alias=AliasChoices('API_HOST', 'BACKEND_HOST'))
    api_port: int = Field(default=8000, validation_alias=AliasChoices('API_PORT', 'BACKEND_PORT'))
    cors_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        validation_alias='CORS_ORIGINS',
    )
    import_max_file_size_bytes: int = Field(default=10 * 1024 * 1024, gt=0, validation_alias='IMPORT_MAX_FILE_SIZE_BYTES')
    import_max_archive_expanded_bytes: int = Field(default=50 * 1024 * 1024, gt=0, validation_alias='IMPORT_MAX_ARCHIVE_EXPANDED_BYTES')
    import_max_concurrent_jobs: int = Field(default=3, gt=0, validation_alias='IMPORT_MAX_CONCURRENT_JOBS')
    pdf_render_timeout_ms: int = Field(default=30000, gt=0, validation_alias='PDF_RENDER_TIMEOUT_MS')
    pdf_max_concurrent_renders: int = Field(default=2, gt=0, validation_alias='PDF_MAX_CONCURRENT_RENDERS')
    pdf_render_queue_timeout_seconds: float = Field(default=8.0, gt=0, validation_alias='PDF_RENDER_QUEUE_TIMEOUT_SECONDS')
    redis_url: str = Field(default='redis://redis:6379/0', validation_alias='REDIS_URL')
    redis_connect_timeout_seconds: float = Field(default=2.0, gt=0, validation_alias='REDIS_CONNECT_TIMEOUT_SECONDS')
    ai_rate_limit_enabled: bool = Field(default=True, validation_alias='AI_RATE_LIMIT_ENABLED')
    ai_requests_per_minute: int = Field(default=10, gt=0, validation_alias='AI_REQUESTS_PER_MINUTE')
    ai_requests_per_hour: int = Field(default=50, gt=0, validation_alias='AI_REQUESTS_PER_HOUR')
    ai_jd_analysis_per_hour: int = Field(default=10, gt=0, validation_alias='AI_JD_ANALYSIS_PER_HOUR')
    ai_ats_analysis_per_hour: int = Field(default=10, gt=0, validation_alias='AI_ATS_ANALYSIS_PER_HOUR')
    ai_tailoring_per_hour: int = Field(default=5, gt=0, validation_alias='AI_TAILORING_PER_HOUR')
    ai_cache_enabled: bool = Field(default=True, validation_alias='AI_CACHE_ENABLED')
    ai_cache_ttl_seconds: int = Field(default=300, gt=0, validation_alias='AI_CACHE_TTL_SECONDS')
    ai_provider_health_ttl_seconds: int = Field(default=900, gt=0, validation_alias='AI_PROVIDER_HEALTH_TTL_SECONDS')
    ai_provider_cooldown_seconds: int = Field(default=60, gt=0, validation_alias='AI_PROVIDER_COOLDOWN_SECONDS')
    ai_request_timeout_seconds: float = Field(default=30, gt=0, validation_alias='AI_REQUEST_TIMEOUT_SECONDS')
    ai_max_concurrent_provider_requests: int = Field(default=4, gt=0, validation_alias='AI_MAX_CONCURRENT_PROVIDER_REQUESTS')
    ai_max_request_bytes: int = Field(default=256 * 1024, gt=0, validation_alias='AI_MAX_REQUEST_BYTES')
    ai_max_resume_bytes: int = Field(default=128 * 1024, gt=0, validation_alias='AI_MAX_RESUME_BYTES')
    ai_max_resume_text_chars: int = Field(default=60000, gt=0, validation_alias='AI_MAX_RESUME_TEXT_CHARS')
    ai_max_jd_chars: int = Field(default=20000, gt=0, validation_alias='AI_MAX_JD_CHARS')
    ai_max_operations: int = Field(default=10, gt=0, validation_alias='AI_MAX_OPERATIONS')
    ai_max_output_chars: int = Field(default=30000, gt=0, validation_alias='AI_MAX_OUTPUT_CHARS')
    ai_prompt_version: str = Field(default='v2', validation_alias='AI_PROMPT_VERSION')
    ai_identity_secret: str = Field(default='development-anonymous-rate-limit-secret', validation_alias='AI_IDENTITY_SECRET')
    trusted_proxy_count: int = Field(default=0, ge=0, validation_alias='TRUSTED_PROXY_COUNT')
    trusted_proxy_hosts: list[str] = Field(default_factory=lambda: ['127.0.0.1', '::1'], validation_alias='TRUSTED_PROXY_HOSTS')
    gemini_api_key: str | None = Field(default=None, validation_alias='GEMINI_API_KEY')
    gemini_model: str = Field(default='gemini-2.5-flash', validation_alias='GEMINI_MODEL')
    openrouter_api_key: str | None = Field(default=None, validation_alias='OPENROUTER_API_KEY')
    openrouter_model: str = Field(default='openai/gpt-4o-mini', validation_alias='OPENROUTER_MODEL')
    openrouter_site_url: str = Field(default='http://localhost:3000', validation_alias='OPENROUTER_SITE_URL')
    openrouter_app_name: str = Field(default='FlowCV', validation_alias='OPENROUTER_APP_NAME')
    storage_provider: str = Field(default='local', alias='STORAGE_PROVIDER')
    storage_path: str = Field(default='./storage', alias='STORAGE_PATH')
    frontend_url: str | None = Field(default=None, validation_alias='FRONTEND_URL')

    @model_validator(mode='after')
    def require_production_identity_secret(self) -> 'Settings':
        if self.app_env.casefold() in {'production', 'prod'}:
            secret = self.ai_identity_secret.strip()
            if len(secret) < 32 or secret == 'development-anonymous-rate-limit-secret' or 'replace-with' in secret.casefold():
                raise ValueError('AI_IDENTITY_SECRET must be a unique secret of at least 32 characters in production')
        return self

    @property
    def allowed_cors_origins(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.frontend_url:
            origins.append(self.frontend_url)
        return list(dict.fromkeys(origins))


@lru_cache
def get_settings() -> Settings:
    return Settings()
