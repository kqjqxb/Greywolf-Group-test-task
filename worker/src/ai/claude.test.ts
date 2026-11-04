import { describe, expect, it, vi } from 'vitest';
import { CLAUDE_MAX_TOKENS, createClaudeProvider } from './claude';
import type { ProviderCall } from './provider';

const CALL: ProviderCall = {
  systemInstruction: 'system rules',
  messages: [{ role: 'user', text: 'dokument' }],
  output: 'analysis',
  timeoutMs: 5_000,
};

/** A Messages API response body. */
function messageResponse(
  content: unknown[],
  stopReason = 'end_turn',
  usage = { input_tokens: 12_000, output_tokens: 2_500 },
): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function apiError(status: number): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'details' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : (input ?? '');
}

function providerWith(fetchMock: typeof fetch) {
  return createClaudeProvider({ apiKey: 'test-key', model: 'claude-haiku-5-5', fetch: fetchMock });
}

describe('Claude provider', () => {
  it('sends model, system, max_tokens, effort low and the JSON schema — and no sampling params', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(messageResponse([{ type: 'text', text: '{"ok":true}' }]));

    await providerWith(fetchMock).call(CALL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(url)).toContain('/v1/messages');
    // SDK 1.x sends the key in the Authorization header.
    expect(new Headers(init?.headers).get('authorization')).toContain('test-key');
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: CLAUDE_MAX_TOKENS,
      system: 'system rules',
      messages: [{ role: 'user', content: 'dokument' }],
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
    // The schema is derived from the Zod contract (all objects closed for structured outputs).
    const format = (body.output_config as { format: { schema: Record<string, unknown> } }).format;
    expect(format.schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(format.schema.properties as object)).toContain('amounts');
  });

  it('returns the text blocks (skipping thinking) and the token usage', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      messageResponse([
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ]),
    );

    expect(await providerWith(fetchMock).call(CALL)).toEqual({
      ok: true,
      text: '{"a":1}',
      usage: { inputTokens: 12_000, outputTokens: 2_500 },
    });
  });

  it('treats stop_reason "refusal" as refused (the chain falls back)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(messageResponse([], 'refusal'));
    expect(await providerWith(fetchMock).call(CALL)).toEqual({ ok: false, error: 'refused' });
  });

  it('treats stop_reason "max_tokens" as an empty (invalid) answer', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        messageResponse([{ type: 'text', text: '{"summary": "uci' }], 'max_tokens'),
      );
    expect(await providerWith(fetchMock).call(CALL)).toMatchObject({ ok: true, text: '' });
  });

  it.each([
    [429, 'rate_limited'],
    [529, 'unavailable'],
    [503, 'unavailable'],
    [401, 'unavailable'],
  ])('maps HTTP %i to %s, without SDK retries', async (status, error) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(apiError(status));

    expect(await providerWith(fetchMock).call(CALL)).toEqual({ ok: false, error });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a network error to unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'));
    expect(await providerWith(fetchMock).call(CALL)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('returns timeout when the call takes longer than its timeout', async () => {
    const hangingFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const result = await providerWith(hangingFetch).call({ ...CALL, timeoutMs: 20 });

    expect(result).toEqual({ ok: false, error: 'timeout' });
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});
