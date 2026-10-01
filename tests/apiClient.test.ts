import { afterEach, describe, expect, it, vi } from 'vitest';

import { importApi, pdfApi, RequestCancelledError, resumeApi, templateApi } from '../frontend/api/client';
import { defaultResume } from '../resume/defaults';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('frontend API client', () => {
  it('serializes Resume JSON and covers CRUD methods', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(defaultResume))
      .mockResolvedValueOnce(jsonResponse(defaultResume))
      .mockResolvedValueOnce(jsonResponse(defaultResume))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await resumeApi.create(defaultResume);
    await resumeApi.get('resume/one');
    await resumeApi.update('resume/one', defaultResume);
    await resumeApi.remove('resume/one');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8000/api/resumes',
      'http://127.0.0.1:8000/api/resumes/resume%2Fone',
      'http://127.0.0.1:8000/api/resumes/resume%2Fone',
      'http://127.0.0.1:8000/api/resumes/resume%2Fone',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ resume: defaultResume });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Content-Type')).toBe('application/json');
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE');
  });

  it('uses the template endpoints and imports compatible Resume JSON', async () => {
    const template = { id: 'modern', name: 'Modern' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ templates: [template] }))
      .mockResolvedValueOnce(jsonResponse(template))
      .mockResolvedValueOnce(jsonResponse(defaultResume));
    vi.stubGlobal('fetch', fetchMock);

    await templateApi.list();
    await templateApi.get('modern');
    await importApi.resumeJson(defaultResume);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8000/api/templates',
      'http://127.0.0.1:8000/api/templates/modern',
      'http://127.0.0.1:8000/api/imports/resume-json',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(defaultResume);
  });

  it('returns PDF downloads as blobs and sends the selected template', async () => {
    const pdf = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => pdf });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pdfApi.create('resume/one', defaultResume, 'ats');

    expect(result).toBe(pdf);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/resumes/resume%2Fone/pdf?templateId=ats',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['pdf', importApi.pdf, 'resume.pdf'],
    ['docx', importApi.docx, 'resume.docx'],
  ])('uploads %s files as multipart form data', async (_format, importFile, fileName) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(defaultResume));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['resume content'], fileName);

    await importFile(file);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
  });

  it('propagates import cancellation through the upload request', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = importApi.pdf(new File(['resume'], 'resume.pdf'), controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it('parses structured API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'validation_error', message: 'Request validation failed' } }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resumeApi.get('bad')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'validation_error',
      message: 'Request validation failed',
    });
  });

  it('normalizes network failures and malformed JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('not json'); },
    }));

    await expect(resumeApi.get('offline')).rejects.toThrow('Network request failed');
    await expect(resumeApi.get('invalid')).rejects.toThrow('Server returned an invalid JSON response');
  });

  it('rejects successful responses that do not match Resume JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'incomplete' })));

    await expect(resumeApi.get('invalid-shape')).rejects.toThrow('Server returned invalid Resume JSON');
  });

  it('aborts requests that exceed the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = expect(resumeApi.get('slow')).rejects.toThrow('Request timed out after 30000 ms');
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
  });

  it('keeps the timeout active while consuming the response body', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = expect(resumeApi.get('slow-body')).rejects.toThrow('Request timed out after 30000 ms');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
  });
});
