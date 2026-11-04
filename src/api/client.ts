import { AppError } from '../lib/errors';
import {
  AnalyzeResponseSchema,
  ApiErrorSchema,
  type AnalyzeRequest,
  type AnalyzeResponse,
} from '../lib/schema';
import { API_URL } from './config';

/**
 * How long `analyze` waits for the worker before giving up. Kept above the worker's own
 * request budget (26 s, worker/src/ai/analyze.ts), so the worker normally answers first
 * with a precise error (e.g. ai_timeout) instead of the browser cutting the request.
 */
export const ANALYZE_TIMEOUT_MS = 32_000;

/**
 * Dev-only mock (see .env.example). `import.meta.env.DEV` is the literal `false` in
 * production builds, so this branch and the mock module are removed from the bundle.
 */
const USE_MOCK_API = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1';

async function send(body: string, signal: AbortSignal): Promise<Response> {
  if (USE_MOCK_API) {
    const { mockFetch } = await import('./mock');
    return mockFetch(body, signal);
  }
  return fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  });
}

/**
 * Calls `POST /analyze` and returns the result with the optional meta (model, cache, time).
 * The response is never trusted: it must match AnalyzeResponseSchema,
 * otherwise a known `{ error }` body is mapped to its code and anything else is `invalid_response`.
 * Always throws AppError on failure: an ApiErrorCode, `network`, `timeout` or `invalid_response`.
 */
export async function analyze(
  request: AnalyzeRequest,
  timeoutMs: number = ANALYZE_TIMEOUT_MS,
): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await send(JSON.stringify(request), controller.signal);
    } catch {
      throw new AppError(controller.signal.aborted ? 'timeout' : 'network');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError(controller.signal.aborted ? 'timeout' : 'invalid_response');
    }

    if (response.ok) {
      const parsed = AnalyzeResponseSchema.safeParse(body);
      if (parsed.success) {
        return parsed.data;
      }
    }
    const apiError = ApiErrorSchema.safeParse(body);
    throw new AppError(apiError.success ? apiError.data.error : 'invalid_response');
  } finally {
    clearTimeout(timer);
  }
}
