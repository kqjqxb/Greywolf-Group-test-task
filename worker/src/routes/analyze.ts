import { MAX_REQUEST_BODY_BYTES } from '../../../src/lib/limits';
import { AnalyzeRequestSchema, type AnalyzeResponse } from '../../../src/lib/schema';
import { analyzeDocument, type AnalyzeOutcome } from '../ai/analyze';
import type { Env } from '../env';
import { errorResponse, isJsonContentType, json, readTextWithLimit } from '../http';

type AnalyzeError = Extract<AnalyzeOutcome, { ok: false }>['error'];

/** HTTP status for each AI failure: 429 is passed through, the rest are gateway errors. */
const ERROR_STATUS: Record<AnalyzeError, number> = {
  rate_limited: 429,
  ai_timeout: 504,
  ai_unavailable: 502,
  ai_invalid_response: 502,
};

/**
 * `POST /analyze` — validates the request, analyzes the text with Gemini and returns
 * `{ result }` (validated AnalysisResult). The origin is already checked by the router.
 */
export async function handleAnalyze(request: Request, env: Env): Promise<Response> {
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

  const outcome = await analyzeDocument(parsed.data, {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  });
  if (!outcome.ok) {
    return errorResponse(outcome.error, ERROR_STATUS[outcome.error]);
  }
  const responseBody: AnalyzeResponse = { result: outcome.result };
  return json(responseBody);
}
