# FlowCV backend

This backend is the Stage 2 service layer for the existing FlowCV frontend.

It is designed to work around the current Resume JSON model rather than replace it.

## Architecture

- FastAPI routes validate the existing Resume JSON contract with Pydantic.
- Resume services depend on a repository boundary; the current adapter is in-memory and data is lost when the process stops.
- Template metadata is served from a static repository. PDF rendering uses a backend style strategy for `modern`, `ats`, `classic`, `executive`, and `sidebar`.
- PDF/DOCX imports extract content on a best-effort basis and normalize it into the same Resume JSON contract.
- The browser remains IndexedDB/local-first. The API client is available for later integration and does not replace Stage 1 persistence.

There is no active database connection, authentication, or AI feature in Stage 2.

## Run locally

```bash
python -m venv .venv
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Runtime configuration is read from environment variables. See `.env.example` for `APP_ENV`, `API_HOST`, `API_PORT`, `CORS_ORIGINS`, upload size, and PDF render timeout settings.

## API surface

- GET /health
- POST /api/resumes
- GET /api/resumes/{resume_id}
- PUT /api/resumes/{resume_id}
- DELETE /api/resumes/{resume_id}
- GET /api/templates
- GET /api/templates/{template_id}
- POST /api/resumes/{resume_id}/pdf
- POST /api/imports/resume-json
- POST /api/imports/pdf
- POST /api/imports/docx

The PDF endpoint accepts `templateId` as an optional query parameter, for example `POST /api/resumes/{resume_id}/pdf?templateId=ats`. When omitted, it uses `resume.settings.template`.

PDF and DOCX upload routes require matching `.pdf`/`.docx` filenames and accepted media types. Uploads default to a 10 MiB limit; DOCX archives are additionally limited to 50 MiB expanded and 1,000 entries. Invalid, unsupported, or oversized files return structured errors.

API errors use an `error` object with a stable `code` and human-readable `message`; validation failures may also include field-level `details`. Common statuses are 400 (bad request), 404 (not found), 413 (size limit), 415 (unsupported media type), 422 (validation), and 500 (generic internal error). Internal exception details are logged server-side and are not returned to clients.

`frontend/api/client.ts` provides typed Resume CRUD, template lookups, PDF blob downloads, Resume JSON validation, and PDF/DOCX multipart uploads. Requests have a 30-second timeout, normalize network and structured HTTP errors, and validate successful Resume responses against the existing frontend schema. The editor itself remains on IndexedDB and does not call this client in Stage 2.

## Import limitations

The import pipeline is intentionally structured as:

- PDF -> parser -> normalized Resume JSON
- DOCX -> parser -> normalized Resume JSON

Data is preserved as best effort and extracted text is retained in the profile/custom sections when a document is not fully structured. The importer does not infer missing resume facts or execute uploaded content.

## Docker

```bash
docker compose config
docker compose build
docker compose up
```

The service listens on port 8000 and exposes `/health` for its container healthcheck.

Docker build and runtime verification passed. The running container was healthy, served `/health` with HTTP 200, and passed live Resume CRUD, template, PDF generation, PDF/DOCX import, and structured-error smoke checks. The Compose stack was then stopped with `docker compose down` and confirmed absent from `docker compose ps`.

PDF output is verified for A4 dimensions, selectable text, links, page counts, and content preservation. Pixel-level raster inspection of the emitted PDF was unavailable in the verification environment because no PDF rasterizer was installed and headless Chromium treated direct PDF navigation as a download.
