import { isOriginAllowed, parseAllowedOrigins, withCors } from './cors';
import type { Env } from './env';
import { errorResponse } from './http';
import { handleAnalyze } from './routes/analyze';
import { handleHealth } from './routes/health';

async function route(request: Request, originAllowed: boolean): Promise<Response> {
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
    return handleAnalyze(request);
  }

  return errorResponse('not_found', 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const originAllowed = isOriginAllowed(origin, parseAllowedOrigins(env.ALLOWED_ORIGIN));

    let response: Response;
    try {
      response = await route(request, originAllowed);
    } catch {
      response = errorResponse('internal_error', 500);
    }
    return withCors(response, originAllowed ? origin : null);
  },
} satisfies ExportedHandler<Env>;
