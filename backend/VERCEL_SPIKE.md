# Vercel Container Spike

The backend project root is `backend/`. Its `vercel.json` routes the backend project's public paths to the `Dockerfile.vercel` container. The image listens on `PORT` (8080 by default in the image); Vercel can override it through the backend project's environment settings.

## Preview environment

Use a separate backend Vercel project so the AI provider credentials are not shared with the frontend project. Set the project root to `backend/`, keep deployments in Preview, and deploy only after linking an existing project. Vercel treats the first deployment of a new project as Production even without `--prod`, so do not create a new project by deploying until a non-production path is confirmed in the dashboard.

Configure these variables in the backend project's Preview environment only:

- `APP_ENV=production`
- `PORT=8080`
- `AI_IDENTITY_SECRET`: a unique random value of at least 32 characters
- `CORS_ORIGINS`: a JSON array containing the exact frontend preview origin and the required local development origins
- `FRONTEND_URL`: the exact frontend preview origin, if used instead of including it in `CORS_ORIGINS`
- `REDIS_URL`: the Upstash TLS Redis connection URL (`rediss://...`), not the REST URL/token pair
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`

Do not add these values to this repository, a Docker build argument, or a `NEXT_PUBLIC_*` variable. Keep the frontend project's `NEXT_PUBLIC_API_BASE` pointed at the backend preview URL. Keep the existing local fallback for development.

The image is larger than the standard function bundle limit. Vercel documents a 5 GB large-functions beta for Node.js, Bun, and Python runtimes, but its documentation does not explicitly confirm that custom container images qualify. Verify eligibility and image acceptance with a real Preview deployment before considering this compatible. VCR separately limits each compressed layer to 2 GB and the total compressed image to 15 GB.

## Known platform constraints

- Vercel documents a 4.5 MB function request/response payload limit. This is below the backend's configured 10 MB upload cap, so uploads above 4.5 MB may fail at Vercel before reaching FastAPI.
- Container images scale to zero; preview instances scale down after 30 seconds without traffic and receive `SIGTERM` with a 30-second grace period.
- The Vercel Hobby plan is restricted to non-commercial personal use. Confirm the account plan and current terms before any commercial use.
- No credentials are stored in this runbook. Preview deployment and external-provider smoke tests require the Vercel project, Upstash URL, and AI keys to be configured outside Git.