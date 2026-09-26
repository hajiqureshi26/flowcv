import { ApiError } from '@/frontend/api/client';

export type AIErrorKind =
  | 'rate_limited'
  | 'provider_unavailable'
  | 'quota_exhausted'
  | 'timeout'
  | 'validation'
  | 'input_too_large'
  | 'invalid_response'
  | 'network'
  | 'unknown';

export type AIErrorState = {
  kind: AIErrorKind;
  message: string;
  retryAfterSeconds?: number;
};

const PROVIDER_CODES: Record<string, AIErrorKind> = {
  provider_timeout: 'timeout',
  provider_unavailable: 'provider_unavailable',
  model_unavailable: 'provider_unavailable',
  quota_exhausted: 'quota_exhausted',
  invalid_ai_response: 'invalid_response',
  ai_service_error: 'provider_unavailable',
};

const INPUT_CODES: Record<string, AIErrorKind> = {
  request_too_large: 'input_too_large',
  resume_too_large: 'input_too_large',
  resume_text_too_large: 'input_too_large',
  job_description_too_large: 'input_too_large',
  file_too_large: 'input_too_large',
};

const RETRY_HINTS: Record<AIErrorKind, string> = {
  rate_limited: 'You have reached the anonymous AI request limit for now.',
  provider_unavailable: 'The AI service is temporarily unavailable. Your resume was not changed.',
  quota_exhausted: 'AI capacity is temporarily exhausted. Your resume was not changed.',
  timeout: 'The AI request took too long and was stopped. Your resume was not changed.',
  network: 'The AI service could not be reached. Check your connection and try again.',
  invalid_response: 'The AI returned a response that could not be used, so it was discarded.',
  validation: 'The request could not be validated.',
  input_too_large: 'This request is larger than the configured AI limit.',
  unknown: 'The AI request could not be completed.',
};

/**
 * Turn any thrown value from `aiApi` into a display state the UI can render.
 *
 * Only validation-style messages from our own backend are echoed back. Provider
 * failures, timeouts and unknown errors use the fixed hint so that upstream
 * responses can never leak provider details or secrets into the interface.
 */
export function describeAIError(error: unknown): AIErrorState {
  if (error instanceof ApiError) {
    const kind = classifyCode(error.code);
    const actionable = kind === 'validation' || kind === 'input_too_large';
    return {
      kind,
      message: actionable && error.message ? error.message : RETRY_HINTS[kind],
      retryAfterSeconds: kind === 'rate_limited' ? error.retryAfterSeconds : undefined,
    };
  }
  if (error instanceof Error) {
    const kind: AIErrorKind = /timed out/i.test(error.message) ? 'timeout' : /network/i.test(error.message) ? 'network' : 'unknown';
    return { kind, message: RETRY_HINTS[kind] };
  }
  return { kind: 'unknown', message: RETRY_HINTS.unknown };
}

function classifyCode(code: string | undefined): AIErrorKind {
  if (!code) return 'unknown';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'validation_error') return 'validation';
  return INPUT_CODES[code] ?? PROVIDER_CODES[code] ?? 'unknown';
}

/** Human-readable countdown used for HTTP 429 messaging. */
export function retryMessage(retryAfterSeconds: number): string {
  return `Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`;
}
