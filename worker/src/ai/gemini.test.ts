import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from './gemini';
import type { ProviderCall } from './provider';

const CALL: ProviderCall = {
  systemInstruction: 'system',
  messages: [
    { role: 'user', text: 'pytanie' },
    { role: 'assistant', text: 'odpowiedź' },
  ],
  output: 'analysis',
  timeoutMs: 5_000,
};

function geminiResponse(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callGemini', () => {
  it('sends the key in the x-goog-api-key header (never in the URL) and maps roles', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(geminiResponse('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callGemini('test-key', 'gemini-x', CALL);

    expect(result).toEqual({ ok: true, text: '{"a":1}' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeTypeOf('string');
    expect(url).toContain('/gemini-x:generateContent');
    expect(url).not.toContain('test-key');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key');
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as {
      contents: { role: string }[];
    };
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model']);
  });

  it('skips thought parts', async () => {
    const response = new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'myślę', thought: true }, { text: '{}' }] } }],
      }),
      { status: 200 },
    );
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
    expect(await callGemini('k', 'm', CALL)).toEqual({ ok: true, text: '{}' });
  });

  it('maps 429 to rate_limited and other errors to unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429 })),
    );
    expect(await callGemini('k', 'm', CALL)).toEqual({ ok: false, error: 'rate_limited' });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 })),
    );
    expect(await callGemini('k', 'm', CALL)).toEqual({ ok: false, error: 'unavailable' });

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network')));
    expect(await callGemini('k', 'm', CALL)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('returns timeout when the request is aborted by the timer', async () => {
    const hangingFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')));
        }),
    );
    vi.stubGlobal('fetch', hangingFetch);

    expect(await callGemini('k', 'm', { ...CALL, timeoutMs: 10 })).toEqual({
      ok: false,
      error: 'timeout',
    });
  });
});
