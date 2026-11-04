import {
  AnalysisResultSchema,
  type AnalysisResult,
  type AnalyzeRequest,
} from '../../../src/lib/schema';
import { countSentences } from '../../../src/lib/sentences';
import { callGemini, type GeminiMessage } from './gemini';
import { buildRetryPrompt, buildUserPrompt, SYSTEM_INSTRUCTION } from './prompt';

export const MIN_SUMMARY_SENTENCES = 3;
export const MAX_SUMMARY_SENTENCES = 5;
const MAX_REPORTED_PROBLEMS = 10;

export interface AnalyzeOptions {
  apiKey: string;
  model: string;
}

export type AnalyzeOutcome =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: 'rate_limited' | 'ai_timeout' | 'ai_unavailable' | 'ai_invalid_response' };

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

/**
 * Analyzes the document with Gemini. An invalid answer gets exactly one retry, in which the model
 * sees its previous answer and the list of problems; a second invalid answer is `ai_invalid_response`.
 * Upstream failures (429, timeout, other) are not retried.
 */
export async function analyzeDocument(
  request: AnalyzeRequest,
  options: AnalyzeOptions,
): Promise<AnalyzeOutcome> {
  const messages: GeminiMessage[] = [{ role: 'user', text: buildUserPrompt(request.text) }];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await callGemini({
      apiKey: options.apiKey,
      model: options.model,
      systemInstruction: SYSTEM_INSTRUCTION,
      messages,
    });
    if (!response.ok) {
      return { ok: false, error: UPSTREAM_ERRORS[response.error] };
    }

    const validation = validateModelOutput(response.text, request);
    if (validation.ok) {
      return { ok: true, result: validation.result };
    }

    messages.push(
      // Gemini rejects empty parts, so an empty answer is replaced with a short marker.
      { role: 'model', text: response.text === '' ? '(empty answer)' : response.text },
      { role: 'user', text: buildRetryPrompt(validation.problems) },
    );
  }

  return { ok: false, error: 'ai_invalid_response' };
}
