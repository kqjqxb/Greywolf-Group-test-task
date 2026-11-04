import { describe, expect, it } from 'vitest';
import type { AnalyzeRequest } from '../../../src/lib/schema';
import {
  fakeClock,
  failure,
  invalidAnswer,
  okAnswer,
  scriptedProvider,
  type ScriptedCall,
} from '../testing/fakeProvider';
import { validateModelOutput } from './analyze';
import {
  CALL_TIMEOUT_CAP_MS,
  emptyStats,
  MIN_CALL_BUDGET_MS,
  REQUEST_BUDGET_MS,
  runChain,
  type ChainTask,
} from './chain';
import type { AnalysisResult } from '../../../src/lib/schema';

const REQUEST: AnalyzeRequest = { fileName: 'umowa-14.pdf', pages: 12, text: 'Treść umowy.' };

const TASK: ChainTask<AnalysisResult> = {
  systemInstruction: 'system',
  userPrompt: 'prompt',
  output: 'analysis',
  validate: (raw) => validateModelOutput(raw, REQUEST),
  minCallBudgetMs: MIN_CALL_BUDGET_MS,
};

/** Chain [claude (paid), gemini, gemini-fallback] with scripted calls and one shared clock. */
function setup(claude: ScriptedCall[], gemini: ScriptedCall[] = [], fallback: ScriptedCall[] = []) {
  const clock = fakeClock();
  const startedAt = clock.now();
  const log: string[] = [];
  const providers = [
    scriptedProvider('claude', claude, clock, log, true),
    scriptedProvider('gemini', gemini, clock, log),
    scriptedProvider('gemini-fallback', fallback, clock, log),
  ];
  const stats = emptyStats();
  const remaining = () => REQUEST_BUDGET_MS - (clock.now() - startedAt);
  const run = () =>
    runChain(
      providers.map((p) => p.provider),
      TASK,
      remaining,
      stats,
    );
  return { providers, log, stats, run };
}

describe('runChain — order and fallback', () => {
  it('uses the first provider (Claude) when it answers', async () => {
    const { log, run, stats } = setup([okAnswer()]);

    const outcome = await run();

    expect(outcome).toMatchObject({ ok: true, model: 'claude' });
    expect(log).toEqual(['claude']);
    expect(stats).toEqual({ paidCalls: 1, usage: { inputTokens: 1000, outputTokens: 200 } });
  });

  it.each([
    ['503/529 unavailable', failure('unavailable')],
    ['429 rate limit', failure('rate_limited')],
    ['timeout', failure('timeout')],
    ['refusal', failure('refused')],
  ])('falls back to Gemini after %s', async (_label, claudeFailure) => {
    const { log, run } = setup([claudeFailure], [okAnswer()]);

    const outcome = await run();

    expect(outcome).toMatchObject({ ok: true, model: 'gemini' });
    expect(log).toEqual(['claude', 'gemini']);
  });

  it('goes through the whole chain in order and returns the last error', async () => {
    const { log, run } = setup(
      [failure('unavailable')],
      [failure('timeout')],
      [failure('rate_limited')],
    );

    const outcome = await run();

    expect(log).toEqual(['claude', 'gemini', 'gemini-fallback']);
    expect(outcome).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('maps a refusal of the last provider to ai_invalid_response', async () => {
    const clock = fakeClock();
    const only = scriptedProvider('claude', [failure('refused')], clock, [], true);
    const outcome = await runChain([only.provider], TASK, () => REQUEST_BUDGET_MS, emptyStats());
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('counts only paid (Claude) calls, including the retry', async () => {
    const { run, stats } = setup([invalidAnswer(), invalidAnswer()]);
    await run();
    expect(stats.paidCalls).toBe(2);
  });
});

describe('runChain — validation retry', () => {
  it('retries once with the previous answer and the problems, then succeeds', async () => {
    const { providers, run } = setup([invalidAnswer(), okAnswer()]);

    const outcome = await run();

    expect(outcome).toMatchObject({ ok: true, model: 'claude' });
    const retry = providers[0]?.calls[1];
    expect(retry?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(retry?.messages[2]?.text).toContain('Your previous answer was invalid');
  });

  it('returns ai_invalid_response after two invalid answers, without falling back', async () => {
    const { log, run } = setup([invalidAnswer(), invalidAnswer()], [okAnswer()]);

    const outcome = await run();

    expect(log).toEqual(['claude', 'claude']);
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('replaces an empty answer with a marker in the retry conversation', async () => {
    const empty: ScriptedCall = { ms: 1_000, result: { ok: true, text: '' } };
    const { providers, run } = setup([empty, okAnswer()]);
    await run();
    expect(providers[0]?.calls[1]?.messages[1]?.text).toBe('(empty answer)');
  });
});

describe('runChain — shared deadline', () => {
  it('gives each call min(remaining budget, cap) as its timeout', async () => {
    const { providers, run } = setup([failure('unavailable', 10_000)], [okAnswer()]);

    await run();

    expect(providers[0]?.calls[0]?.timeoutMs).toBe(CALL_TIMEOUT_CAP_MS);
    expect(providers[1]?.calls[0]?.timeoutMs).toBe(REQUEST_BUDGET_MS - 10_000);
  });

  it('skips the next provider when less than the minimum budget is left', async () => {
    const { log, run } = setup([failure('timeout', CALL_TIMEOUT_CAP_MS)], [okAnswer()]);

    const outcome = await run();

    expect(REQUEST_BUDGET_MS - CALL_TIMEOUT_CAP_MS).toBeLessThan(MIN_CALL_BUDGET_MS);
    expect(log).toEqual(['claude']);
    expect(outcome).toEqual({ ok: false, error: 'ai_timeout' });
  });

  it('skips the validation retry when less than the minimum budget is left', async () => {
    const { log, run } = setup([invalidAnswer(REQUEST_BUDGET_MS - MIN_CALL_BUDGET_MS + 1)]);

    const outcome = await run();

    expect(log).toEqual(['claude']);
    expect(outcome).toEqual({ ok: false, error: 'ai_invalid_response' });
  });

  it('still retries when exactly the minimum budget is left', async () => {
    const { log, run } = setup([invalidAnswer(REQUEST_BUDGET_MS - MIN_CALL_BUDGET_MS), okAnswer()]);

    const outcome = await run();

    expect(log).toEqual(['claude', 'claude']);
    expect(outcome.ok).toBe(true);
  });
});
