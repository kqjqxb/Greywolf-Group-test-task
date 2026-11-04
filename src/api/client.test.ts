import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleResult } from '../lib/fixtures/sample-result';
import { AppError, type AppErrorCode } from '../lib/errors';
import { analyze, ANALYZE_TIMEOUT_MS } from './client';

const request = { fileName: 'umowa.pdf', pages: 4, text: 'Tekst' };

function mockFetchResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

async function expectCode(promise: Promise<unknown>, code: AppErrorCode) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyze', () => {
  it('returns the validated result', async () => {
    mockFetchResponse({ result: sampleResult });
    await expect(analyze(request)).resolves.toEqual({ result: sampleResult });
  });

  it('returns the optional meta next to the result', async () => {
    const meta = {
      model: 'claude-haiku-5-5',
      promptVersion: '1.0.0',
      durationMs: 9000,
      cached: true,
      chunks: 1,
    };
    mockFetchResponse({ result: sampleResult, meta });
    await expect(analyze(request)).resolves.toEqual({ result: sampleResult, meta });
  });

  it('waits longer than the worker budget (26 s) by default', () => {
    expect(ANALYZE_TIMEOUT_MS).toBeGreaterThan(26_000);
  });

  it('maps a worker error body to its code', async () => {
    mockFetchResponse({ error: 'rate_limited' }, 429);
    await expectCode(analyze(request), 'rate_limited');
  });

  it('rejects a 200 response that does not match the schema', async () => {
    mockFetchResponse({ result: { ...sampleResult, keyPoints: [] } });
    await expectCode(analyze(request), 'invalid_response');
  });

  it('rejects an unknown error code and non-JSON bodies', async () => {
    mockFetchResponse({ error: 'something_new' }, 500);
    await expectCode(analyze(request), 'invalid_response');

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))),
    );
    await expectCode(analyze(request), 'invalid_response');
  });

  it('maps a failed fetch to network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expectCode(analyze(request), 'network');
  });

  it('aborts after the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            );
          }),
      ),
    );
    await expectCode(analyze(request, 10), 'timeout');
  });
});
