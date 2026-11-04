export interface Env {
  /** Secret, set with `wrangler secret put GEMINI_API_KEY` (locally in worker/.dev.vars). */
  GEMINI_API_KEY: string;
  /** Frontend origin allowed by CORS, set in wrangler.toml [vars]. */
  ALLOWED_ORIGIN: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  fetch(request): Response {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
