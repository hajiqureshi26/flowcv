import { describe, expect, it } from 'vitest';

import { ApiError } from '../frontend/api/client';
import { describeAIError, retryMessage } from '../frontend/ai/errors';

describe('AI error reporting', () => {
  it('maps a rate limited response to the Retry-After delay', () => {
    const state = describeAIError(new ApiError('AI request limit reached', 429, 'rate_limited', 60));

    expect(state.kind).toBe('rate_limited');
    expect(state.retryAfterSeconds).toBe(60);
    expect(state.message).toContain('anonymous AI request limit');
    expect(retryMessage(state.retryAfterSeconds as number)).toBe('Try again in 60 seconds.');
    expect(retryMessage(1)).toBe('Try again in 1 second.');
  });

  it.each([
    ['provider_timeout', 'timeout'],
    ['provider_unavailable', 'provider_unavailable'],
    ['model_unavailable', 'provider_unavailable'],
    ['quota_exhausted', 'quota_exhausted'],
    ['invalid_ai_response', 'invalid_response'],
    ['validation_error', 'validation'],
    ['request_too_large', 'input_too_large'],
    ['resume_text_too_large', 'input_too_large'],
    ['job_description_too_large', 'input_too_large'],
  ])('classifies the %s code as %s', (code, kind) => {
    expect(describeAIError(new ApiError('failed', 503, code)).kind).toBe(kind);
  });

  it('never exposes an API key or provider secret in the message', () => {
    const state = describeAIError(new ApiError('Provider rejected key sk-live-secret', 502, 'ai_service_error'));

    expect(state.message).not.toContain('sk-live-secret');
  });

  it('classifies transport failures and unknown values', () => {
    expect(describeAIError(new Error('Network request failed')).kind).toBe('network');
    expect(describeAIError(new Error('Request timed out after 30000 ms')).kind).toBe('timeout');
    expect(describeAIError(new Error('Server returned an invalid JSON response')).kind).toBe('unknown');
    expect(describeAIError('boom').kind).toBe('unknown');
    expect(describeAIError(undefined).message).toBe('The AI request could not be completed.');
  });
});
