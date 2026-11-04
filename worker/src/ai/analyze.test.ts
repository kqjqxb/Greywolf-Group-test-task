import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleResult } from '../../../src/lib/fixtures/sample-result';
import type { AnalyzeRequest } from '../../../src/lib/schema';
import { analyzeDocument, validateModelOutput } from './analyze';
import { callGemini } from './gemini';

const REQUEST: AnalyzeRequest = { fileName: 'umowa-14.pdf', pages: 12, text: 'Treść umowy.' };
const OPTIONS = { apiKey: 'test-key', model: 'test-model' };

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

  it('maps upstream 429 to rate_limited without retrying', async () => {
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
