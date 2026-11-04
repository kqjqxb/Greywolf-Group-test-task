import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyzeResponseSchema } from '../../../src/lib/schema';
import { PROMPT_VERSION } from '../ai/prompt';
import { budgetKey } from '../budget';
import { cacheKey } from '../cache';
import type { Env } from '../env';
import { FakeKv } from '../testing/fakeKv';
import { validModelAnswer } from '../testing/fakeProvider';
import { buildProviders, handleAnalyze, modelsFromConfig, USAGE_HEADER } from './analyze';

const TEXT = '--- Strona 1 ---\nUmowa nr 14/2026';
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);

function makeEnv(kv: FakeKv, overrides: Partial<Env> = {}): Env {
  return {
    GEMINI_API_KEY: 'gemini-key',
    ANTHROPIC_API_KEY: 'anthropic-key',
    ALLOWED_ORIGIN: 'https://kqjqxb.github.io',
    CLAUDE_MODEL: 'claude-haiku-5-5',
    CLAUDE_DAILY_LIMIT: '150',
    GEMINI_MODEL: 'gemini-primary',
    GEMINI_FALLBACK_MODEL: 'gemini-fallback',
    ANALYZE_RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
    PDF_INSIGHT_KV: kv,
    ...overrides,
  };
}

function analyzeRequest(fileName = 'umowa.pdf'): Request {
  return new Request('https://api.test/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, pages: 12, text: TEXT }),
  });
}

function claudeMessage(text: string): Response {
  return new Response(
    JSON.stringify({
      id: 'msg',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 12_000, output_tokens: 2_500 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function geminiAnswer(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

/** Global fetch (Gemini) and the fetch handed to the Anthropic SDK, both mocked. */
function mocks(claude: Response[], gemini: Response[] = []) {
  const claudeFetch = vi.fn<typeof fetch>();
  for (const response of claude) {
    claudeFetch.mockResolvedValueOnce(response);
  }
  const geminiFetch = vi.fn<typeof fetch>();
  for (const response of gemini) {
    geminiFetch.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', geminiFetch);
  return { claudeFetch, geminiFetch, deps: { now: () => NOW, claudeFetch } };
}

async function readBody(response: Response) {
  return AnalyzeResponseSchema.parse(await response.json());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /analyze — chain, budget and cache', () => {
  it('uses Claude first, counts the call, caches the result and reports usage', async () => {
    const kv = new FakeKv();
    const { claudeFetch, geminiFetch, deps } = mocks([claudeMessage(validModelAnswer())]);

    const response = await handleAnalyze(analyzeRequest(), makeEnv(kv), deps);

    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.meta).toMatchObject({
      model: 'claude-haiku-5-5',
      promptVersion: PROMPT_VERSION,
      cached: false,
      chunks: 1,
    });
    expect(claudeFetch).toHaveBeenCalledTimes(1);
    expect(geminiFetch).not.toHaveBeenCalled();
    expect(kv.data.get(budgetKey(NOW))).toBe('1');
    expect(kv.data.has(await cacheKey(TEXT))).toBe(true);
    expect(response.headers.get(USAGE_HEADER)).toBe(
      'calls=1; input_tokens=12000; output_tokens=2500',
    );
  });

  it('never stores the document text in the cache', async () => {
    const kv = new FakeKv();
    const { deps } = mocks([claudeMessage(validModelAnswer())]);
    await handleAnalyze(analyzeRequest(), makeEnv(kv), deps);
    const stored = kv.data.get(await cacheKey(TEXT)) ?? '';
    expect(stored).not.toContain('Umowa nr 14/2026');
  });

  it('answers a repeated text from the cache with cached = true and the current file name', async () => {
    const kv = new FakeKv();
    const { claudeFetch, deps } = mocks([claudeMessage(validModelAnswer())]);
    await handleAnalyze(analyzeRequest('pierwszy.pdf'), makeEnv(kv), deps);

    const response = await handleAnalyze(analyzeRequest('drugi.pdf'), makeEnv(kv), deps);

    const body = await readBody(response);
    expect(claudeFetch).toHaveBeenCalledTimes(1); // no second AI call
    expect(body.meta).toMatchObject({ model: 'claude-haiku-5-5', cached: true, chunks: 1 });
    expect(body.result.document.fileName).toBe('drugi.pdf');
    expect(response.headers.get(USAGE_HEADER)).toBeNull();
  });

  it('does not cache an invalid result', async () => {
    const kv = new FakeKv();
    const { deps } = mocks([claudeMessage('not json'), claudeMessage('still not json')]);

    const response = await handleAnalyze(analyzeRequest(), makeEnv(kv), deps);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'ai_invalid_response' });
    expect(kv.data.has(await cacheKey(TEXT))).toBe(false);
    expect(kv.data.get(budgetKey(NOW))).toBe('2'); // failed calls still cost money
  });

  it('skips Claude when the daily limit is reached and goes straight to Gemini', async () => {
    const kv = new FakeKv();
    kv.data.set(budgetKey(NOW), '150');
    const { claudeFetch, geminiFetch, deps } = mocks([], [geminiAnswer(validModelAnswer())]);

    const response = await handleAnalyze(analyzeRequest(), makeEnv(kv), deps);

    const body = await readBody(response);
    expect(claudeFetch).not.toHaveBeenCalled();
    expect(geminiFetch.mock.calls[0]?.[0]).toContain('gemini-primary');
    expect(body.meta?.model).toBe('gemini-primary');
    expect(kv.data.get(budgetKey(NOW))).toBe('150');
  });

  it('falls back to Gemini when Claude is overloaded', async () => {
    const kv = new FakeKv();
    const overloaded = new Response('{"type":"error","error":{"type":"overloaded_error"}}', {
      status: 529,
      headers: { 'Content-Type': 'application/json' },
    });
    const { geminiFetch, deps } = mocks([overloaded], [geminiAnswer(validModelAnswer())]);

    const body = await readBody(await handleAnalyze(analyzeRequest(), makeEnv(kv), deps));

    expect(geminiFetch).toHaveBeenCalledTimes(1);
    expect(body.meta?.model).toBe('gemini-primary');
  });
});

describe('buildProviders', () => {
  it('orders the chain Claude → Gemini primary → Gemini fallback', () => {
    const env = makeEnv(new FakeKv());
    expect(buildProviders(env, true).map((p) => p.model)).toEqual([
      'claude-haiku-5-5',
      'gemini-primary',
      'gemini-fallback',
    ]);
    expect(buildProviders(env, false).map((p) => p.model)).toEqual([
      'gemini-primary',
      'gemini-fallback',
    ]);
  });

  it('leaves Claude out without a key or model', () => {
    const noKey = makeEnv(new FakeKv(), { ANTHROPIC_API_KEY: '' });
    const noModel = makeEnv(new FakeKv(), { CLAUDE_MODEL: ' ' });
    expect(buildProviders(noKey, true)[0]?.model).toBe('gemini-primary');
    expect(buildProviders(noModel, true)[0]?.model).toBe('gemini-primary');
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
