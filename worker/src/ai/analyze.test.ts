import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleResult } from '../../../src/lib/fixtures/sample-result';
import type { AnalyzeRequest } from '../../../src/lib/schema';
import {
  analyzeDocument,
  CALL_TIMEOUT_CAP_MS,
  MIN_CALL_BUDGET_MS,
  modelsFromConfig,
  REQUEST_BUDGET_MS,
  validateModelOutput,
} from './analyze';
import { callGemini } from './gemini';
import { PROMPT_VERSION } from './prompt';

const REQUEST: AnalyzeRequest = { fileName: 'umowa-14.pdf', pages: 12, text: 'Treść umowy.' };
const OPTIONS = { apiKey: 'test-key', models: ['test-model'] };

/** A valid model answer: the sample result without fileName/pages (the worker adds them). */
function validModelAnswer(): string {
  const { language, type, title, date } = sampleResult.document;
  return JSON.stringify({ ...sampleResult, document: { language, type, title, date } });
}

/** Gemini generateContent response wrapping the given model text. */
function geminiResponse(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Parsed JSON body of the n-th fetch call. */
function sentBody(fetchMock: ReturnType<typeof mockFetch>, call: number): unknown {
  const body = fetchMock.mock.calls[call]?.[1]?.body;
  return typeof body === 'string' ? JSON.parse(body) : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeDocument', () => {
  it('returns a validated result on the first try, with fileName/pages from the request', async () => {
    const fetchMock = mockFetch(geminiResponse(validModelAnswer()));

    const outcome = await analyzeDocument(REQUEST, OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.document.fileName).toBe('umowa-14.pdf');
      expect(outcome.result.document.pages).toBe(12);
      expect(outcome.result.summary).toBe(sampleResult.summary);
    }
  });

  it('sends the key in the x-goog-api-key header, never in the URL', async () => {
    const fetchMock = mockFetch(geminiResponse(validModelAnswer()));

    await analyzeDocument(REQUEST, OPTIONS);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeTypeOf('string');
    expect(url).not.toContain('test-key');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key');
  });

  it('retries once after an invalid answer and returns the second, valid one', async () => {
    const fetchMock = mockFetch(
      geminiResponse('{"summary": "niepełne"'),
      geminiResponse(validModelAnswer()),
    );

    const outcome = await analyzeDocument(REQUEST, OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(true);
    // The retry includes the previous answer and a note about what was wrong.
    expect(JSON.stringify(sentBody(fetchMock, 1))).toContain('Your previous answer was invalid');
  });

  it('returns ai_invalid_response after two invalid answers (exactly one retry)', async () => {
    const fetchMock = mockFetch(geminiResponse('not json'), geminiResponse('{"document": {}}'));

    const outcome = await analyzeDocument(REQUEST, OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('maps upstream 429 to rate_limited when there is no fallback model', async () => {
    const fetchMock = mockFetch(new Response('{"error": {"message": "quota"}}', { status: 429 }));

    const outcome = await analyzeDocument(REQUEST, OPTIONS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('maps other upstream errors to ai_unavailable', async () => {
    mockFetch(new Response('{"error": {"message": "internal details"}}', { status: 500 }));
    expect(await analyzeDocument(REQUEST, OPTIONS)).toEqual({ ok: false, error: 'ai_unavailable' });

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network')));
    expect(await analyzeDocument(REQUEST, OPTIONS)).toEqual({ ok: false, error: 'ai_unavailable' });
  });
});

/** One scripted upstream call: how long it "takes" on the fake clock and what it returns. */
interface ScriptedCall {
  ms: number;
  response: () => Response;
}

/**
 * fetch mock driven by a fake clock: each call advances the clock by its `ms` and returns its
 * response. Records the model (from the URL) and the abort timeout each call was given.
 */
function scriptedUpstream(calls: ScriptedCall[]) {
  let clock = 1_000_000;
  const models: string[] = [];
  const fetchMock = vi.fn<typeof fetch>((url) => {
    const call = calls[models.length];
    // callGemini always passes the URL as a string.
    const match = /models\/([^:]+):/.exec(typeof url === 'string' ? url : '');
    models.push(decodeURIComponent(match?.[1] ?? '?'));
    if (!call) {
      return Promise.reject(new Error('unexpected call'));
    }
    clock += call.ms;
    return Promise.resolve(call.response());
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, models, now: () => clock };
}

const ok = () => geminiResponse(validModelAnswer());
const invalid = () => geminiResponse('not json');
const status = (code: number) => () => new Response('{"error": {}}', { status: code });

describe('analyzeDocument — fallback model and shared deadline', () => {
  const MODELS = ['primary', 'fallback'];

  it('returns meta with the model used, the prompt version and the duration', async () => {
    const upstream = scriptedUpstream([{ ms: 4_000, response: ok }]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(outcome).toMatchObject({
      ok: true,
      meta: { model: 'primary', promptVersion: PROMPT_VERSION, durationMs: 4_000 },
    });
    expect(upstream.models).toEqual(['primary']);
  });

  it.each([
    ['503 high demand', status(503)],
    ['429 quota (separate quota per model)', status(429)],
  ])('falls back to the second model after %s', async (_label, failure) => {
    const upstream = scriptedUpstream([
      { ms: 1_000, response: failure },
      { ms: 9_000, response: ok },
    ]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(upstream.models).toEqual(['primary', 'fallback']);
    expect(outcome).toMatchObject({ ok: true, meta: { model: 'fallback', durationMs: 10_000 } });
  });

  it('returns the last error when both models fail (429 on the fallback → rate_limited)', async () => {
    const upstream = scriptedUpstream([
      { ms: 1_000, response: status(503) },
      { ms: 1_000, response: status(429) },
    ]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(outcome).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('does not fall back after an invalid answer (exactly one retry with the same model)', async () => {
    const upstream = scriptedUpstream([
      { ms: 3_000, response: invalid },
      { ms: 3_000, response: invalid },
    ]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(upstream.models).toEqual(['primary', 'primary']);
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('gives each call min(remaining budget, cap) as its timeout', async () => {
    const timeouts: number[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const upstream = scriptedUpstream([
      { ms: 10_000, response: status(503) },
      { ms: 5_000, response: ok },
    ]);

    await analyzeDocument(REQUEST, { ...OPTIONS, models: MODELS, now: upstream.now });

    for (const call of setTimeoutSpy.mock.calls) {
      timeouts.push(Number(call[1]));
    }
    setTimeoutSpy.mockRestore();
    expect(timeouts).toEqual([CALL_TIMEOUT_CAP_MS, REQUEST_BUDGET_MS - 10_000]);
  });

  it('skips the fallback when less than the minimum budget is left (keeps the timeout error)', async () => {
    const hangingFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')));
        }),
    );
    vi.stubGlobal('fetch', hangingFetch);
    vi.useFakeTimers();
    try {
      // The primary hangs until its 20 s timeout; then only 6 s of the 26 s budget are left.
      const pending = analyzeDocument(REQUEST, { ...OPTIONS, models: MODELS, now: Date.now });
      await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_CAP_MS);
      const outcome = await pending;

      expect(REQUEST_BUDGET_MS - CALL_TIMEOUT_CAP_MS).toBeLessThan(MIN_CALL_BUDGET_MS);
      expect(hangingFetch).toHaveBeenCalledTimes(1);
      expect(outcome).toEqual({ ok: false, error: 'ai_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the validation retry when less than the minimum budget is left', async () => {
    const upstream = scriptedUpstream([
      { ms: REQUEST_BUDGET_MS - MIN_CALL_BUDGET_MS + 1, response: invalid },
    ]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(upstream.fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('still retries when exactly the minimum budget is left', async () => {
    const upstream = scriptedUpstream([
      { ms: REQUEST_BUDGET_MS - MIN_CALL_BUDGET_MS, response: invalid },
      { ms: 5_000, response: ok },
    ]);

    const outcome = await analyzeDocument(REQUEST, {
      ...OPTIONS,
      models: MODELS,
      now: upstream.now,
    });

    expect(upstream.models).toEqual(['primary', 'primary']);
    expect(outcome.ok).toBe(true);
  });
});

describe('modelsFromConfig', () => {
  it('drops an empty or duplicate fallback', () => {
    expect(modelsFromConfig('a', 'b')).toEqual(['a', 'b']);
    expect(modelsFromConfig('a', '')).toEqual(['a']);
    expect(modelsFromConfig('a', undefined)).toEqual(['a']);
    expect(modelsFromConfig('a', ' a ')).toEqual(['a']);
  });
});

describe('callGemini', () => {
  it('returns timeout when the request is aborted by the timer', async () => {
    // fetch that never resolves until its signal aborts, like a slow upstream.
    const hangingFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')));
        }),
    );
    vi.stubGlobal('fetch', hangingFetch);

    const result = await callGemini({
      apiKey: 'k',
      model: 'm',
      systemInstruction: 's',
      messages: [{ role: 'user', text: 't' }],
      timeoutMs: 10,
    });

    expect(result).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('validateModelOutput', () => {
  it('overrides fileName/pages produced by the model with the request values', () => {
    const answer = JSON.stringify(sampleResult); // contains fileName "umowa.pdf", pages 4
    const validation = validateModelOutput(answer, REQUEST);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.result.document.fileName).toBe('umowa-14.pdf');
      expect(validation.result.document.pages).toBe(12);
    }
  });

  it('rejects a summary with fewer than 3 or more than 5 sentences', () => {
    const tooShort = JSON.parse(validModelAnswer()) as Record<string, unknown>;
    tooShort.summary = 'Jedno zdanie. Drugie zdanie.';
    const short = validateModelOutput(JSON.stringify(tooShort), REQUEST);
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.problems[0]).toContain('2 sentences');
    }

    const tooLong = {
      ...tooShort,
      summary: 'Raz jest. Dwa są. Trzy są. Cztery są. Pięć jest. Sześć jest.',
    };
    expect(validateModelOutput(JSON.stringify(tooLong), REQUEST).ok).toBe(false);
  });

  it('reports schema problems by field path', () => {
    const answer = JSON.parse(validModelAnswer()) as Record<string, unknown>;
    answer.amounts = [{ value: 1, currency: 'zł', context: 'x' }];
    const validation = validateModelOutput(JSON.stringify(answer), REQUEST);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.problems.join('\n')).toContain('amounts.0.currency');
    }
  });
});
