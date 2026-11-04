import { isOriginAllowed, parseAllowedOrigins, withCors } from './cors';
import type { Env } from './env';
import { errorResponse, withSecurityHeaders } from './http';
import { isWithinRateLimit, RATE_LIMIT_PERIOD_SECONDS } from './rateLimit';
import { handleAnalyze } from './routes/analyze';
import { handleHealth } from './routes/health';

/** 429 for a client over our own per-IP limit; Retry-After tells it when to try again. */
function rateLimitedResponse(): Response {
  const response = errorResponse('rate_limited', 429);
  response.headers.set('Retry-After', String(RATE_LIMIT_PERIOD_SECONDS));
  return response;
}

async function route(request: Request, env: Env, originAllowed: boolean): Promise<Response> {
  const { pathname } = new URL(request.url);

  // CORS preflight: only answered for allowed origins.
  if (request.method === 'OPTIONS') {
    return originAllowed
      ? new Response(null, { status: 204 })
      : errorResponse('forbidden_origin', 403);
  }

  if (pathname === '/health') {
    return request.method === 'GET' ? handleHealth() : errorResponse('method_not_allowed', 405);
  }

  if (pathname === '/analyze') {
    if (request.method !== 'POST') {
      return errorResponse('method_not_allowed', 405);
    }
    // Block other sites (and plain scripts without an Origin) from using our LLM quota.
    if (!originAllowed) {
      return errorResponse('forbidden_origin', 403);
    }
    // Checked before reading the body, so a flood of requests costs as little as possible.
    if (!(await isWithinRateLimit(env.ANALYZE_RATE_LIMITER, request))) {
      return rateLimitedResponse();
    }
    return handleAnalyze(request, env);
  }

  return errorResponse('not_found', 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const originAllowed = isOriginAllowed(origin, parseAllowedOrigins(env.ALLOWED_ORIGIN));

    let response: Response;
    try {
      response = await route(request, env, originAllowed);
    } catch {
      response = errorResponse('internal_error', 500);
    }
    return withSecurityHeaders(withCors(response, originAllowed ? origin : null));
  },
} satisfies ExportedHandler<Env>;
