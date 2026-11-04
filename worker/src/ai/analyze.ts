import {
  AnalysisResultSchema,
  type AnalysisResult,
  type AnalyzeMeta,
  type AnalyzeRequest,
} from '../../../src/lib/schema';
import { countSentences } from '../../../src/lib/sentences';
import {
  emptyStats,
  MAX_ATTEMPTS_PER_PROVIDER,
  MIN_CALL_BUDGET_MS,
  REQUEST_BUDGET_MS,
  runChain,
  type AnalyzeError,
  type CallStats,
  type Remaining,
  type Validation,
} from './chain';
import { MAX_KEYWORDS, mergeChunkResults, planChunks } from './chunking';
import { dedupeAmounts, dedupeStrings, mergeDates } from './dedupe';
import { SummaryOutputSchema } from './outputSchema';
import {
  buildChunkUserPrompt,
  buildSummaryUserPrompt,
  buildUserPrompt,
  PROMPT_VERSION,
  SUMMARY_SYSTEM_INSTRUCTION,
  SYSTEM_INSTRUCTION,
} from './prompt';
import type { ModelProvider } from './provider';

export const MIN_SUMMARY_SENTENCES = 3;
export const MAX_SUMMARY_SENTENCES = 5;
const MAX_REPORTED_PROBLEMS = 10;
/** The final summary of a chunked document is a short call, so it may start with less budget. */
export const MIN_SUMMARY_BUDGET_MS = 4_000;

export interface AnalyzeOptions {
  /** Providers to try in order (see routes/analyze.ts for how the list is built). */
  providers: readonly ModelProvider[];
  /** Clock in milliseconds, injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

/** `stats` is returned in both cases: failed calls cost money too and count towards the budget. */
export type AnalyzeOutcome =
  | { ok: true; result: AnalysisResult; meta: AnalyzeMeta; stats: CallStats }
  | { ok: false; error: AnalyzeError; stats: CallStats };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(rawText: string): { ok: true; json: unknown } | { ok: false } {
  try {
    return { ok: true, json: JSON.parse(rawText) };
  } catch {
    return { ok: false };
  }
}

function summaryProblem(summary: string): string | null {
  const sentences = countSentences(summary);
  const rule = `"summary" has ${sentences} sentences; it must have ${MIN_SUMMARY_SENTENCES}–${MAX_SUMMARY_SENTENCES}`;
  // Tell the model how to fix it, not only that it is wrong (a bare count was repeated on retry).
  if (sentences > MAX_SUMMARY_SENTENCES) {
    return `${rule}. Rewrite it with at most ${MAX_SUMMARY_SENTENCES} sentences: merge sentences or move details to keyPoints.`;
  }
  if (sentences < MIN_SUMMARY_SENTENCES) {
    return `${rule}. Rewrite it with at least ${MIN_SUMMARY_SENTENCES} complete sentences.`;
  }
  return null;
}

/**
 * Deterministic clean-up after validation, so the rules hold for every provider:
 * one entry per date (contexts merged), no duplicate amounts, names or keywords, and at most
 * MAX_KEYWORDS keywords. The prompt asks for 3–10 keywords; a longer list is trimmed here instead
 * of being rejected by the schema, because failing a whole analysis over extra keywords helps nobody.
 */
function cleanUp(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    entities: {
      organizations: dedupeStrings(result.entities.organizations),
      people: dedupeStrings(result.entities.people),
    },
    amounts: dedupeAmounts(result.amounts),
    dates: mergeDates(result.dates),
    keywords: dedupeStrings(result.keywords).slice(0, MAX_KEYWORDS),
  };
}

/**
 * Checks the model's raw answer: JSON → add fileName/pages from the request → Zod contract
 * → summary sentence count → clean-up. Problems are short descriptions (paths and rules,
 * no document text) used in the retry prompt.
 */
export function validateModelOutput(
  rawText: string,
  request: AnalyzeRequest,
): Validation<AnalysisResult> {
  const parsedJson = parseJson(rawText);
  if (!parsedJson.ok) {
    return { ok: false, problems: ['The answer was not valid JSON.'] };
  }
  const { json } = parsedJson;
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

  const problem = summaryProblem(parsed.data.summary);
  if (problem !== null) {
    return { ok: false, problems: [problem] };
  }
  return { ok: true, value: cleanUp(parsed.data) };
}

/** Checks the answer of the final summary call of a chunked analysis. */
export function validateSummaryOutput(rawText: string): Validation<string> {
  const parsedJson = parseJson(rawText);
  const parsed = parsedJson.ok ? SummaryOutputSchema.safeParse(parsedJson.json) : null;
  if (!parsed?.success) {
    return { ok: false, problems: ['The answer must be a JSON object with a "summary" string.'] };
  }
  const problem = summaryProblem(parsed.data.summary);
  return problem === null
    ? { ok: true, value: parsed.data.summary }
    : { ok: false, problems: [problem] };
}

/** Distinct models in the order they were used, e.g. "claude-haiku-5-5 + gemini-3.6-flash". */
function describeModels(models: readonly string[]): string {
  return [...new Set(models)].join(' + ');
}

/**
 * Most Claude calls a document can cost: every task (one per chunk, plus the final summary call
 * when there is more than one chunk) may use the first call and one retry on Claude. Upstream
 * failures move on to Gemini, so they never add Claude calls. Used to check the daily budget
 * before the request starts.
 */
export function maxClaudeCalls(chunkCount: number): number {
  const tasks = chunkCount > 1 ? chunkCount + 1 : 1;
  return tasks * MAX_ATTEMPTS_PER_PROVIDER;
}

/** Documents up to the chunking threshold: one call on the chain. */
async function analyzeWhole(
  request: AnalyzeRequest,
  providers: readonly ModelProvider[],
  remaining: Remaining,
  stats: CallStats,
) {
  const outcome = await runChain(
    providers,
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      userPrompt: buildUserPrompt(request.text),
      output: 'analysis',
      validate: (raw) => validateModelOutput(raw, request),
      minCallBudgetMs: MIN_CALL_BUDGET_MS,
    },
    remaining,
    stats,
  );
  return outcome.ok
    ? { ok: true as const, result: outcome.value, model: outcome.model, chunks: 1 }
    : outcome;
}

/**
 * F-08: chunks are analyzed in parallel (each on the chain, within the same deadline), merged
 * deterministically, and the summary is rewritten from the chunk summaries by one short call.
 * Any failed call fails the request — a result silently missing part of the document would mislead.
 * That includes the summary call: a chunk's summary describes only part of the document, so it is
 * not used as a fallback. No time left for the summary call → `ai_timeout`.
 */
async function analyzeInChunks(
  request: AnalyzeRequest,
  chunks: readonly string[],
  providers: readonly ModelProvider[],
  remaining: Remaining,
  stats: CallStats,
) {
  const outcomes = await Promise.all(
    chunks.map((chunk, index) =>
      runChain(
        providers,
        {
          systemInstruction: SYSTEM_INSTRUCTION,
          userPrompt: buildChunkUserPrompt(chunk, index, chunks.length),
          output: 'analysis',
          validate: (raw) => validateModelOutput(raw, request),
          minCallBudgetMs: MIN_CALL_BUDGET_MS,
        },
        remaining,
        stats,
      ),
    ),
  );

  const results: AnalysisResult[] = [];
  const models: string[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      return outcome;
    }
    results.push(outcome.value);
    models.push(outcome.model);
  }

  if (remaining() < MIN_SUMMARY_BUDGET_MS) {
    return { ok: false as const, error: 'ai_timeout' as const };
  }
  const summary = await runChain(
    providers,
    {
      systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
      userPrompt: buildSummaryUserPrompt(results.map((result) => result.summary)),
      output: 'summary',
      validate: validateSummaryOutput,
      minCallBudgetMs: MIN_SUMMARY_BUDGET_MS,
    },
    remaining,
    stats,
  );
  if (!summary.ok) {
    return summary;
  }
  models.push(summary.model);
  return {
    ok: true as const,
    result: mergeChunkResults(results, summary.value),
    model: describeModels(models),
    chunks: chunks.length,
  };
}

/**
 * Analyzes the document within one shared time budget (REQUEST_BUDGET_MS), on the provider chain
 * (chain.ts). Long documents are split into chunks (chunking.ts).
 */
export async function analyzeDocument(
  request: AnalyzeRequest,
  options: AnalyzeOptions,
): Promise<AnalyzeOutcome> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const remaining: Remaining = () => REQUEST_BUDGET_MS - (now() - startedAt);
  const stats = emptyStats();

  const chunks = planChunks(request.text);
  const outcome =
    chunks.length > 1
      ? await analyzeInChunks(request, chunks, options.providers, remaining, stats)
      : await analyzeWhole(request, options.providers, remaining, stats);

  if (!outcome.ok) {
    return { ok: false, error: outcome.error, stats };
  }
  const meta: AnalyzeMeta = {
    model: outcome.model,
    promptVersion: PROMPT_VERSION,
    durationMs: now() - startedAt,
    chunks: outcome.chunks,
  };
  return { ok: true, result: outcome.result, meta, stats };
}
