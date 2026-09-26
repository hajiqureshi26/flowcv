import type { Resume } from '@/resume/types';
import { resumeSchema } from '@/resume/schema';
import type { TemplateDefinition, TemplateId } from '@/templates/registry';
import type {
  AIResponse,
  ATSAnalysisResult,
  JDAnalysisResult,
  ResumeImproveInput,
  ResumeImproveResult,
  TailoringResult,
} from '@/frontend/ai/types';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Reads the numeric `Retry-After` delay that AI endpoints send with HTTP 429. */
function retryAfterSeconds(headers: Headers | undefined): number | undefined {
  const raw = headers?.get?.('Retry-After');
  if (!raw) return undefined;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

function responseError(status: number, body: string, headers?: Headers): ApiError {
  let message = body || `Request failed with status ${status}`;
  let code: string | undefined;
  try {
    const payload = JSON.parse(body) as { error?: { message?: string; code?: string }; detail?: unknown; message?: string };
    code = payload.error?.code;
    if (payload.error?.message) message = payload.error.message;
    else if (typeof payload.detail === 'string') message = payload.detail;
    else if (Array.isArray(payload.detail)) {
      message = payload.detail.map((item) => typeof item === 'object' && item && 'msg' in item ? String(item.msg) : '').filter(Boolean).join('; ');
    } else if (payload.message) message = payload.message;
  } catch {
    // Keep the server's plain-text message when the response is not JSON.
  }
  return new ApiError(message, status, code, retryAfterSeconds(headers));
}

async function withResponse<T>(path: string, init: RequestInit | undefined, consume: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal });
    if (!response.ok) {
      let text = '';
      try {
        text = await response.text();
      } catch {
        text = '';
      }
      throw responseError(response.status, text, response.headers);
    }
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS} ms`);
    if (error instanceof TypeError) throw new Error('Network request failed');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return withResponse(path, {
    ...init,
    headers,
  }, async (response) => {
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error('Server returned an invalid JSON response');
    }
  });
}

async function upload(path: string, file: File): Promise<Resume> {
  const formData = new FormData();
  formData.append('file', file);
  return withResponse(path, { method: 'POST', body: formData }, async (response) => {
    try {
      return resumeSchema.parse(await response.json()) as Resume;
    } catch {
      throw new Error('Server returned invalid Resume JSON');
    }
  });
}

async function requestResume(path: string, init?: RequestInit): Promise<Resume> {
  const payload = await request<unknown>(path, init);
  try {
    return resumeSchema.parse(payload) as Resume;
  } catch {
    throw new Error('Server returned invalid Resume JSON');
  }
}

export const resumeApi = {
  create: (resume: Resume) => requestResume('/api/resumes', { method: 'POST', body: JSON.stringify({ resume }) }),
  get: (id: string) => requestResume(`/api/resumes/${encodeURIComponent(id)}`),
  update: (id: string, resume: Resume) => requestResume(`/api/resumes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ resume }) }),
  remove: (id: string) => request<void>(`/api/resumes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const templateApi = {
  list: () => request<{ templates: TemplateDefinition[] }>('/api/templates'),
  get: (id: TemplateId) => request<TemplateDefinition>(`/api/templates/${encodeURIComponent(id)}`),
};

export const pdfApi = {
  create: async (resumeId: string, resume?: Resume, templateId?: TemplateId) => {
    const query = templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
    return withResponse(
      `/api/resumes/${encodeURIComponent(resumeId)}/pdf${query}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resume ?? null) },
      (response) => response.blob(),
    );
  },
};

export const importApi = {
  resumeJson: (payload: unknown) => requestResume('/api/imports/resume-json', { method: 'POST', body: JSON.stringify(payload) }),
  pdf: (file: File) => upload('/api/imports/pdf', file),
  docx: (file: File) => upload('/api/imports/docx', file),
};

export const aiApi = {
  improveResume: (input: ResumeImproveInput) => request<AIResponse<ResumeImproveResult>>('/api/ai/resume/improve', { method: 'POST', body: JSON.stringify(input) }),
  analyzeJobDescription: (job_description: string) => request<AIResponse<JDAnalysisResult>>('/api/ai/jd/analyze', { method: 'POST', body: JSON.stringify({ job_description }) }),
  analyzeATS: (resume: Resume, job_description: string) => request<AIResponse<ATSAnalysisResult>>('/api/ai/ats/analyze', { method: 'POST', body: JSON.stringify({ resume, job_description }) }),
  tailorResume: (resume: Resume, job_description: string) => request<AIResponse<TailoringResult>>('/api/ai/tailor', { method: 'POST', body: JSON.stringify({ resume, job_description }) }),
};
