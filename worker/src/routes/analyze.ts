import { MAX_REQUEST_BODY_BYTES } from '../../../src/lib/limits';
import { AnalyzeRequestSchema, type AnalyzeResponse } from '../../../src/lib/schema';
import { analyzeDocument, maxClaudeCalls } from '../ai/analyze';
import type { AnalyzeError, CallStats } from '../ai/chain';
import { isTooLong, planChunks } from '../ai/chunking';
import { createClaudeProvider } from '../ai/claude';
import { createGeminiProvider } from '../ai/gemini';
import { PROMPT_VERSION } from '../ai/prompt';
import type { ModelProvider } from '../ai/provider';
import { hasClaudeBudget, parseDailyLimit, recordClaudeCalls } from '../budget';
import { cacheKey, readCachedResult, writeCachedResult } from '../cache';
import type { Env } from '../env';
import { errorResponse, isJsonContentType, json, readTextWithLimit } from '../http';

/** HTTP status for each AI failure: 429 is passed through, the rest are gateway errors. */
const ERROR_STATUS: Record<AnalyzeError, number> = {
  rate_limited: 429,
  ai_timeout: 504,
  ai_unavailable: 502,
  ai_invalid_response: 502,
};

/**
 * Diagnostic header with the tokens Claude used for this request (to measure cost per analysis).
 * Only counts, never content; not part of the JSON contract.
 */
export const USAGE_HEADER = 'X-Claude-Usage';

/** Test seams: a fake clock and a fake fetch for the Anthropic SDK. */
export interface AnalyzeDeps {
  now?: () => number;
  claudeFetch?: typeof fetch;
}

/** Primary + fallback Gemini model from the config, without empty or duplicate entries. */
export function modelsFromConfig(primary: string, fallback: string | undefined): string[] {
  const models = [primary, fallback ?? ''].map((model) => model.trim());
  return models.filter((model, index) => model !== '' && models.indexOf(model) === index);
}

/** Chain order: Claude (when allowed) → Gemini primary → Gemini fallback. */
export function buildProviders(
  env: Env,
  useClaude: boolean,
  deps: AnalyzeDeps = {},
): ModelProvider[] {
  const providers: ModelProvider[] = [];
  const claudeModel = env.CLAUDE_MODEL?.trim() ?? '';
  if (useClaude && env.ANTHROPIC_API_KEY && claudeModel !== '') {
    providers.push(
      createClaudeProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: claudeModel,
        ...(deps.claudeFetch ? { fetch: deps.claudeFetch } : {}),
      }),
    );
  }
  for (const model of modelsFromConfig(env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL)) {
    providers.push(createGeminiProvider(env.GEMINI_API_KEY, model));
  }
  return providers;
}

function withUsageHeader(response: Response, stats: CallStats): Response {
  if (stats.paidCalls > 0) {
    const { inputTokens, outputTokens } = stats.usage;
    response.headers.set(
      USAGE_HEADER,
      `calls=${stats.paidCalls}; input_tokens=${inputTokens}; output_tokens=${outputTokens}`,
    );
  }
  return response;
}

/**
 * `POST /analyze` — validates the request, answers from the result cache when possible, otherwise
 * analyzes the text on the provider chain and returns `{ result, meta }`. Origin and rate limit
 * are already checked by the router.
 */
export async function handleAnalyze(
  request: Request,
  env: Env,
  deps: AnalyzeDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();

  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse('unsupported_media_type', 415);
  }

  const rawBody = await readTextWithLimit(request, MAX_REQUEST_BODY_BYTES);
  if (rawBody === null) {
    return errorResponse('payload_too_large', 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('invalid_json', 400);
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('invalid_body', 400);
  }
  const analyzeRequest = parsed.data;
  const store = env.PDF_INSIGHT_KV;

  // Size: more text than MAX_CHUNKS chunks is rejected before any AI call (cost guard).
  const chunks = planChunks(analyzeRequest.text);
  if (isTooLong(analyzeRequest.text, chunks)) {
    return errorResponse('payload_too_large', 413);
  }

  // 1. Cache: the same text was already analyzed with this prompt version → no AI call at all.
  const key = await cacheKey(analyzeRequest.text);
  const cached = await readCachedResult(store, key);
  if (cached !== null) {
    const cachedBody: AnalyzeResponse = {
      result: {
        ...cached.result,
        // The file name and page count always describe the current request.
        document: {
          ...cached.result.document,
          fileName: analyzeRequest.fileName,
          pages: analyzeRequest.pages,
        },
      },
      meta: {
        model: cached.model,
        promptVersion: PROMPT_VERSION,
        durationMs: now() - startedAt,
        cached: true,
        chunks: cached.chunks,
      },
    };
    return json(cachedBody);
  }

  // 2. Budget: when this request's worst-case Claude calls do not fit into today's limit,
  //    Claude is skipped for the whole request and the chain starts with Gemini.
  const useClaude = await hasClaudeBudget(
    store,
    parseDailyLimit(env.CLAUDE_DAILY_LIMIT),
    maxClaudeCalls(chunks.length),
    now(),
  );
  const outcome = await analyzeDocument(analyzeRequest, {
    providers: buildProviders(env, useClaude, deps),
    ...(deps.now ? { now: deps.now } : {}),
  });
  await recordClaudeCalls(store, outcome.stats.paidCalls, now());

  if (!outcome.ok) {
    return withUsageHeader(
      errorResponse(outcome.error, ERROR_STATUS[outcome.error]),
      outcome.stats,
    );
  }

  // 3. Only validated results are cached.
  await writeCachedResult(store, key, {
    result: outcome.result,
    model: outcome.meta.model,
    chunks: outcome.meta.chunks ?? 1,
  });
  const responseBody: AnalyzeResponse = {
    result: outcome.result,
    meta: { ...outcome.meta, cached: false },
  };
  return withUsageHeader(json(responseBody), outcome.stats);
}
