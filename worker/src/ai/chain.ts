import type { OutputKind } from './outputSchema';
import { buildRetryPrompt } from './prompt';
import type { ChatMessage, ModelProvider, ProviderError, TokenUsage } from './provider';

/**
 * Provider chain: tries the providers in order (Claude → Gemini primary → Gemini fallback)
 * within one shared deadline, with the same validation and single-retry rules for every provider.
 */

/**
 * Time budget for the whole request (all providers, retries and chunks together).
 * The Definition of Done is "result in < 30 s"; 26 s leaves room for PDF reading and the network,
 * and the frontend waits a bit longer (32 s) so it always receives the worker's own error.
 */
export const REQUEST_BUDGET_MS = 26_000;
/** One call never takes longer than this, even when more budget is left. */
export const CALL_TIMEOUT_CAP_MS = 20_000;
/**
 * A new document call (fallback provider or validation retry) starts only if at least this much
 * budget is left. A 12-page document takes ~10–15 s, so a shorter call would almost surely time out.
 */
export const MIN_CALL_BUDGET_MS = 8_000;

/** First call + exactly one retry after an invalid answer (the brief's retry rule). */
export const MAX_ATTEMPTS_PER_PROVIDER = 2;

export type AnalyzeError = 'rate_limited' | 'ai_timeout' | 'ai_unavailable' | 'ai_invalid_response';

const PROVIDER_ERRORS: Record<ProviderError, AnalyzeError> = {
  rate_limited: 'rate_limited',
  timeout: 'ai_timeout',
  unavailable: 'ai_unavailable',
  // From the user's point of view a refusal is an answer we cannot use.
  refused: 'ai_invalid_response',
};

/** Result of validating one raw answer; `problems` are short and never contain document text. */
export type Validation<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export interface ChainTask<T> {
  systemInstruction: string;
  /** First user message (task sentence + delimited data). */
  userPrompt: string;
  output: OutputKind;
  validate: (rawText: string) => Validation<T>;
  /** Minimum budget for starting a fallback or retry call (short calls may use less). */
  minCallBudgetMs: number;
}

/** Milliseconds left of the shared request budget. */
export type Remaining = () => number;

/** Counters for one request: paid (Claude) calls for the daily budget, tokens for cost. */
export interface CallStats {
  paidCalls: number;
  usage: TokenUsage;
}

export function emptyStats(): CallStats {
  return { paidCalls: 0, usage: { inputTokens: 0, outputTokens: 0 } };
}

export type ChainOutcome<T> =
  { ok: true; value: T; model: string } | { ok: false; error: AnalyzeError };

type ProviderOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'invalid' }
  | { ok: false; kind: 'upstream'; error: ProviderError };

/**
 * One provider: first call and — if the answer is invalid and enough budget is left — exactly one
 * retry in which the model sees its previous answer and the list of problems.
 */
async function runWithProvider<T>(
  provider: ModelProvider,
  task: ChainTask<T>,
  remaining: Remaining,
  stats: CallStats,
): Promise<ProviderOutcome<T>> {
  const messages: ChatMessage[] = [{ role: 'user', text: task.userPrompt }];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt += 1) {
    if (provider.paid) {
      stats.paidCalls += 1;
    }
    const response = await provider.call({
      systemInstruction: task.systemInstruction,
      messages,
      output: task.output,
      timeoutMs: Math.max(0, Math.min(remaining(), CALL_TIMEOUT_CAP_MS)),
    });
    if (!response.ok) {
      return { ok: false, kind: 'upstream', error: response.error };
    }
    if (response.usage) {
      stats.usage.inputTokens += response.usage.inputTokens;
      stats.usage.outputTokens += response.usage.outputTokens;
    }

    const validation = task.validate(response.text);
    if (validation.ok) {
      return { ok: true, value: validation.value };
    }
    // No time for a useful retry: report the invalid answer now instead of timing out later.
    if (remaining() < task.minCallBudgetMs) {
      break;
    }

    messages.push(
      // Empty messages are rejected by the APIs, so an empty answer is replaced with a short marker.
      { role: 'assistant', text: response.text === '' ? '(empty answer)' : response.text },
      { role: 'user', text: buildRetryPrompt(validation.problems) },
    );
  }

  return { ok: false, kind: 'invalid' };
}

/**
 * Runs one task on the chain.
 * - Upstream failure of a provider (503/529, timeout, 429, refusal) → the next provider is tried,
 *   if at least `minCallBudgetMs` is left. When every provider failed, the last error is returned.
 * - Invalid answer → exactly one retry with the same provider, then `ai_invalid_response`
 *   (another model is not more likely to follow the schema, so there is no fallback here).
 */
export async function runChain<T>(
  providers: readonly ModelProvider[],
  task: ChainTask<T>,
  remaining: Remaining,
  stats: CallStats,
): Promise<ChainOutcome<T>> {
  let lastError: AnalyzeError = 'ai_unavailable';
  for (const [index, provider] of providers.entries()) {
    if (index > 0 && remaining() < task.minCallBudgetMs) {
      break;
    }

    const outcome = await runWithProvider(provider, task, remaining, stats);
    if (outcome.ok) {
      return { ok: true, value: outcome.value, model: provider.model };
    }
    if (outcome.kind === 'invalid') {
      return { ok: false, error: 'ai_invalid_response' };
    }
    lastError = PROVIDER_ERRORS[outcome.error];
  }
  return { ok: false, error: lastError };
}
