FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /build

COPY requirements-prod.txt ./requirements-prod.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install -r requirements-prod.txt \
    && /opt/venv/bin/python -m playwright install chromium --only-shell

FROM python:3.12-slim AS runtime

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    API_HOST=0.0.0.0 \
    API_PORT=8000

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /ms-playwright /ms-playwright
RUN python -m playwright install-deps chromium-headless-shell \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY app ./app

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host \"$API_HOST\" --port \"$API_PORT\""]
