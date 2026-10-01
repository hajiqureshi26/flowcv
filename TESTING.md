# Stage 6 verification

## Automated checks

Run the frontend unit suite, TypeScript check, and backend suite from the repository root:

```powershell
npm test
npm run typecheck
Push-Location backend
..\.venv\Scripts\python.exe -m pytest
Pop-Location
```

The Playwright suite uses the production build. Build first, then run `npm run test:e2e`. The Stage 6 spec checks document overflow at 320, 360, 375, 390, 414, 768, 1024, 1280, and 1440 CSS pixels; it scans core routes with axe-core for serious/critical WCAG 2.0/2.1 A/AA findings; and it checks dialog focus entry, Escape close, and focus restoration.

## Controlled local API load smoke

Start the backend with Redis and a locally installed Playwright Chromium browser, then run:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe scripts\stage6_load.py --requests 30 --concurrency 4
Pop-Location
```

The script refuses non-loopback URLs, uses synthetic PDF/DOCX/resume data, and does not call AI providers. It records response codes, elapsed time, throughput, error rate, and p50/p95/p99/max latency for PDF export and PDF/DOCX import. The concurrency and request caps are intentionally bounded. HTTP 503 responses are included in the report as saturation evidence, not counted as successful work. Run higher loads only against an isolated local deployment and increase one parameter at a time.

## Stage 6 local smoke result

One run on 2026-10-01 used Docker Desktop on Windows, the Python 3.12 slim API container, Redis 7 Alpine, 30 requests per path, and a maximum of four in-flight HTTP requests. The workload mixed three endpoints across 90 total requests. Both health endpoints returned 200, all 30 PDF exports, 30 PDF imports, and 30 DOCX imports returned 200. Total elapsed time was 16.31 s (5.52 requests/s); observed error rate was 0%.

| Path | p50 | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: |
| PDF export | 2099.0 ms | 2372.1 ms | 2471.4 ms | 2471.4 ms |
| PDF import | 17.0 ms | 22.2 ms | 29.6 ms | 29.6 ms |
| DOCX import | 33.9 ms | 45.3 ms | 46.8 ms | 46.8 ms |

During this run, five container usage samples were captured: API peak 337.33% CPU and 506.5 MiB memory; Redis peak 9.48% CPU and 7.688 MiB memory. These are coarse sampled peaks, not complete CPU accounting. The host CPU model and sustained resource utilization were not recorded. The PDF path is the measured latency bottleneck in this small workload. This result only describes this local configuration and workload; it is not a user-capacity guarantee.

The automated checks do not replace hands-on screen-reader testing, real-device testing, visual review at every route/state, or production-like multi-process load testing. Local timings are environment-specific and are not a production capacity claim. No real AI provider traffic should be used for load tests.
