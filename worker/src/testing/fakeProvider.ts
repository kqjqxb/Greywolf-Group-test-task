import { sampleResult } from '../../../src/lib/fixtures/sample-result';
import type { ModelProvider, ProviderCall, ProviderResult } from '../ai/provider';

/** One scripted call: how long it "takes" on the fake clock and what it returns. */
export interface ScriptedCall {
  ms: number;
  result: ProviderResult;
}

/** Shared fake clock; providers advance it by the duration of each scripted call. */
export function fakeClock(start = 1_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/**
 * Provider that returns scripted results in order and records every request it received
 * (into its own `calls` and into the shared `log`, so tests can check the chain order).
 */
export function scriptedProvider(
  model: string,
  script: ScriptedCall[],
  clock: ReturnType<typeof fakeClock>,
  log: string[] = [],
  paid = false,
) {
  const calls: ProviderCall[] = [];
  const provider: ModelProvider = {
    model,
    paid,
    call: (request) => {
      calls.push(request);
      log.push(model);
      const next = script[calls.length - 1];
      if (next === undefined) {
        return Promise.reject(new Error(`unexpected call ${calls.length} to ${model}`));
      }
      clock.advance(next.ms);
      return Promise.resolve(next.result);
    },
  };
  return { provider, calls };
}

/** A valid model answer: the sample result without fileName/pages (the worker adds them). */
export function validModelAnswer(): string {
  const { language, type, title, date } = sampleResult.document;
  return JSON.stringify({ ...sampleResult, document: { language, type, title, date } });
}

export const okAnswer = (ms = 1_000): ScriptedCall => ({
  ms,
  result: { ok: true, text: validModelAnswer(), usage: { inputTokens: 1000, outputTokens: 200 } },
});
export const invalidAnswer = (ms = 1_000): ScriptedCall => ({
  ms,
  result: { ok: true, text: 'not json' },
});
export const failure = (
  error: 'rate_limited' | 'timeout' | 'unavailable' | 'refused',
  ms = 1_000,
): ScriptedCall => ({ ms, result: { ok: false, error } });
