import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiApi, ApiError } from '../frontend/api/client';
import { defaultResume } from '../resume/defaults';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status < 400,
  status,
  headers: new Headers(headers),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const envelope = (result: unknown) => ({
  result,
  provider: { name: 'gemini', model: 'gemini-2.5-flash', fallback_used: false, cached: false },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI API client', () => {
  it('posts the selected resume text to the improvement endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ original: 'a', suggested: 'b', rationale: 'c' })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await aiApi.improveResume({ resume: defaultResume, section: 'profile', content: 'a', operation: 'grammar' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/ai/resume/improve');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ resume: defaultResume, section: 'profile', content: 'a', operation: 'grammar' });
    expect(response.provider).toEqual({ name: 'gemini', model: 'gemini-2.5-flash', fallback_used: false, cached: false });
  });

  it('posts job description, ATS and tailoring requests to their endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ suggestions: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await aiApi.analyzeJobDescription('Senior designer');
    await aiApi.analyzeATS(defaultResume, 'Senior designer');
    await aiApi.tailorResume(defaultResume, 'Senior designer');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8000/api/ai/jd/analyze',
      'http://127.0.0.1:8000/api/ai/ats/analyze',
      'http://127.0.0.1:8000/api/ai/tailor',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ job_description: 'Senior designer' });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ resume: defaultResume, job_description: 'Senior designer' });
  });

  it('exposes the Retry-After delay from an HTTP 429 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'AI request limit reached.' } }, 429, { 'Retry-After': '42' })));

    await expect(aiApi.analyzeJobDescription('x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 42,
    });
  });

  it('omits the retry delay when the header is missing or not numeric', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'rate_limited', message: 'limited' } }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'provider_unavailable', message: 'down' } }, 503, { 'Retry-After': 'soon' })));

    const first = (await aiApi.analyzeJobDescription('x').catch((error: unknown) => error)) as ApiError;
    const second = (await aiApi.analyzeJobDescription('x').catch((error: unknown) => error)) as ApiError;

    expect(first.retryAfterSeconds).toBeUndefined();
    expect(first.code).toBe('rate_limited');
    expect(second.retryAfterSeconds).toBeUndefined();
    expect(second.code).toBe('provider_unavailable');
  });
});
