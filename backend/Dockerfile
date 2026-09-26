FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8000

COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt && playwright install --with-deps chromium

COPY app ./app
COPY README.md ./README.md

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host \"$API_HOST\" --port \"$API_PORT\""]
