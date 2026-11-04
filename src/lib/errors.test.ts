import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from './schema';
import {
  AppError,
  CLIENT_ERROR_CODES,
  errorMessage,
  isRetryable,
  toErrorCode,
  type AppErrorCode,
} from './errors';

const ALL_CODES: AppErrorCode[] = [...API_ERROR_CODES, ...CLIENT_ERROR_CODES];

describe('errorMessage', () => {
  it.each(ALL_CODES)('has a non-empty Polish message for "%s"', (code) => {
    const message = errorMessage(code);
    expect(message.length).toBeGreaterThan(10);
    // Never leak the raw code to the user.
    expect(message).not.toContain(code);
  });

  it('mentions the limits in size messages', () => {
    expect(errorMessage('file_too_large')).toContain('10 MB');
    expect(errorMessage('payload_too_large')).toBe(
      'Dokument jest zbyt długi do analizy (maks. ok. 300 tys. znaków).',
    );
    expect(errorMessage('text_too_large')).toBe(errorMessage('payload_too_large'));
  });
});

describe('isRetryable', () => {
  it('allows retry for network and AI errors', () => {
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('timeout')).toBe(true);
    expect(isRetryable('ai_invalid_response')).toBe(true);
    expect(isRetryable('rate_limited')).toBe(true);
  });

  it('does not offer retry when the file itself is the problem', () => {
    expect(isRetryable('file_not_pdf')).toBe(false);
    expect(isRetryable('pdf_encrypted')).toBe(false);
    expect(isRetryable('pdf_no_text')).toBe(false);
  });
});

describe('toErrorCode', () => {
  it('keeps AppError codes and maps anything else to unknown', () => {
    expect(toErrorCode(new AppError('timeout'))).toBe('timeout');
    expect(toErrorCode(new Error('boom'))).toBe('unknown');
    expect(toErrorCode('string')).toBe('unknown');
  });
});
