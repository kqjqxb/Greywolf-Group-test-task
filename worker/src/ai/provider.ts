import type { OutputKind } from './outputSchema';

/**
 * Provider-agnostic interface for one LLM call. Claude and Gemini implement it, so the chain in
 * chain.ts can try them in order without knowing anything about their APIs.
 */

/** One turn of the conversation. Each provider maps it to its own format. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ProviderCall {
  /** Fixed instructions (never contains document text). */
  systemInstruction: string;
  messages: readonly ChatMessage[];
  /** Which structured-output schema the answer must follow. */
  output: OutputKind;
  /** Hard limit for this one call; the chain derives it from the shared request deadline. */
  timeoutMs: number;
}

/** Token counts reported by the provider (used to measure cost). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Upstream failure categories — never the upstream message or the key.
 * `refused`: the model declined the request (Claude stop_reason "refusal").
 */
export type ProviderError = 'rate_limited' | 'timeout' | 'unavailable' | 'refused';

/**
 * Outcome of one call. `text` is the model's raw answer (expected to be JSON); an empty or
 * truncated answer is still `ok: true`, so the caller validates it and may retry.
 */
export type ProviderResult =
  { ok: true; text: string; usage?: TokenUsage } | { ok: false; error: ProviderError };

export interface ModelProvider {
  /** Model id, reported in `meta.model`. */
  readonly model: string;
  /** True for Claude: its calls count towards the daily budget (budget.ts). */
  readonly paid: boolean;
  call(request: ProviderCall): Promise<ProviderResult>;
}
