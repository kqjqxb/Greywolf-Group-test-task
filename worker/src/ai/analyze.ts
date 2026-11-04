import {
  AnalysisResultSchema,
  type AnalysisResult,
  type AnalyzeMeta,
  type AnalyzeRequest,
} from '../../../src/lib/schema';
import { countSentences } from '../../../src/lib/sentences';
import { callGemini, type GeminiMessage } from './gemini';
import { buildRetryPrompt, buildUserPrompt, PROMPT_VERSION, SYSTEM_INSTRUCTION } from './prompt';

export const MIN_SUMMARY_SENTENCES = 3;
export const MAX_SUMMARY_SENTENCES = 5;
const MAX_REPORTED_PROBLEMS = 10;

/**
 * Time budget for the whole request (all models and the validation retry together).
 * The Definition of Done is "result in < 30 s"; 26 s leaves room for PDF reading and the network,
 * and the frontend waits a bit longer (32 s) so it always receives the worker's own error.
 */
export const REQUEST_BUDGET_MS = 26_000;
/** One Gemini call never takes longer than this, even when more budget is left. */
export const CALL_TIMEOUT_CAP_MS = 20_000;
/**
 * A new call (fallback model or validation retry) starts only if at least this much budget is left.
 * A 12-page document takes ~10–15 s, so a shorter call would almost surely time out anyway.
 */
export const MIN_CALL_BUDGET_MS = 8_000;

export interface AnalyzeOptions {
  apiKey: string;
  /** Models to try in order: the primary first, then the fallback (used only on upstream errors). */
  models: readonly string[];
  /** Clock in milliseconds, injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

type UpstreamError = 'rate_limited' | 'ai_timeout' | 'ai_unavailable';
type AnalyzeError = UpstreamError | 'ai_invalid_response';

export type AnalyzeOutcome =
  { ok: true; result: AnalysisResult; meta: AnalyzeMeta } | { ok: false; error: AnalyzeError };

type Validation = { ok: true; result: AnalysisResult } | { ok: false; problems: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the model's raw answer: JSON → add fileName/pages from the request → Zod contract
 * → summary sentence count. Problems are short descriptions (paths and rules, no document text)
 * used in the retry prompt.
 */
export function validateModelOutput(rawText: string, request: AnalyzeRequest): Validation {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, problems: ['The answer was not valid JSON.'] };
  }
  if (!isRecord(json) || !isRecord(json.document)) {
    return { ok: false, problems: ['The answer must be a JSON object with a "document" object.'] };
  }

  // The model never decides fileName/pages: they always come from the request.
  const merged = {
    ...json,
    document: { ...json.document, fileName: request.fileName, pages: request.pages },
  };

  const parsed = AnalysisResultSchema.safeParse(merged);
  if (!parsed.success) {
    // A few issues are enough for the model to fix the answer; keep the retry prompt short.
    const problems = parsed.error.issues
      .slice(0, MAX_REPORTED_PROBLEMS)
      .map((issue) => `Field "${issue.path.join('.')}": ${issue.message}`);
    return { ok: false, problems };
  }

  const sentences = countSentences(parsed.data.summary);
  if (sentences < MIN_SUMMARY_SENTENCES || sentences > MAX_SUMMARY_SENTENCES) {
    return {
      ok: false,
      problems: [
        `"summary" has ${sentences} sentences; it must have ${MIN_SUMMARY_SENTENCES}–${MAX_SUMMARY_SENTENCES}.`,
      ],
    };
  }

  return { ok: true, result: parsed.data };
}

const UPSTREAM_ERRORS = {
  rate_limited: 'rate_limited',
  timeout: 'ai_timeout',
  unavailable: 'ai_unavailable',
} as const;

/** Milliseconds left of the request budget; created once per request. */
type Budget = () => number;

type ModelOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: AnalyzeError };

/**
 * One model: first call, and — if the answer is invalid and enough budget is left — exactly one
 * retry in which the model sees its previous answer and the list of problems.
 */
async function analyzeWithModel(
  request: AnalyzeRequest,
  apiKey: string,
  model: string,
  remaining: Budget,
): Promise<ModelOutcome> {
  const messages: GeminiMessage[] = [{ role: 'user', text: buildUserPrompt(request.text) }];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await callGemini({
      apiKey,
      model,
      systemInstruction: SYSTEM_INSTRUCTION,
      messages,
      timeoutMs: Math.min(remaining(), CALL_TIMEOUT_CAP_MS),
    });
    if (!response.ok) {
      return { ok: false, error: UPSTREAM_ERRORS[response.error] };
    }

    const validation = validateModelOutput(response.text, request);
    if (validation.ok) {
      return { ok: true, result: validation.result };
    }
    // No time for a useful retry: report the invalid answer now instead of timing out later.
    if (remaining() < MIN_CALL_BUDGET_MS) {
      break;
    }

    messages.push(
      // Gemini rejects empty parts, so an empty answer is replaced with a short marker.
      { role: 'model', text: response.text === '' ? '(empty answer)' : response.text },
      { role: 'user', text: buildRetryPrompt(validation.problems) },
    );
  }

  return { ok: false, error: 'ai_invalid_response' };
}

/**
 * Analyzes the document with Gemini, within one shared time budget (REQUEST_BUDGET_MS).
 * - Upstream failure of a model (503 "high demand", timeout, 429 — every model has its own quota)
 *   → the next model in `options.models` is tried, if at least MIN_CALL_BUDGET_MS is left.
 *   When every model failed, the last model's error is returned.
 * - Invalid answer → exactly one retry with the same model, then `ai_invalid_response`
 *   (a different model would not be more likely to follow the schema, so no fallback here).
 */
export async function analyzeDocument(
  request: AnalyzeRequest,
  options: AnalyzeOptions,
): Promise<AnalyzeOutcome> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const remaining: Budget = () => REQUEST_BUDGET_MS - (now() - startedAt);

  let lastError: AnalyzeError = 'ai_unavailable';
  for (const [index, model] of options.models.entries()) {
    if (index > 0 && remaining() < MIN_CALL_BUDGET_MS) {
      break;
    }

    const outcome = await analyzeWithModel(request, options.apiKey, model, remaining);
    if (outcome.ok) {
      const meta: AnalyzeMeta = {
        model,
        promptVersion: PROMPT_VERSION,
        durationMs: now() - startedAt,
      };
      return { ok: true, result: outcome.result, meta };
    }
    if (outcome.error === 'ai_invalid_response') {
      return { ok: false, error: outcome.error };
    }
    lastError = outcome.error;
  }

  return { ok: false, error: lastError };
}

/** Primary + fallback model from the config, without empty or duplicate entries. */
export function modelsFromConfig(primary: string, fallback: string | undefined): string[] {
  const models = [primary, fallback ?? ''].map((model) => model.trim());
  return models.filter((model, index) => model !== '' && models.indexOf(model) === index);
}
