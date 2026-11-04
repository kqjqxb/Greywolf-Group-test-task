import { describe, expect, it, vi } from 'vitest';
import type { Env } from './env';
import worker from './index';
import { clientKey, type RateLimiter } from './rateLimit';
import { FakeKv } from './testing/fakeKv';

const ORIGIN = 'https://kqjqxb.github.io';

/** Fake limiter: allows the first `allowed` calls per key, like the Cloudflare binding. */
function fakeLimiter(allowed: number) {
  const counts = new Map<string, number>();
  const limit = vi.fn<RateLimiter['limit']>(({ key }) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return Promise.resolve({ success: count <= allowed });
  });
  return { limit };
}

function makeEnv(limiter: RateLimiter): Env {
  return {
    GEMINI_API_KEY: 'test-key',
    ALLOWED_ORIGIN: ORIGIN,
    GEMINI_MODEL: 'primary',
    GEMINI_FALLBACK_MODEL: 'fallback',
    ANALYZE_RATE_LIMITER: limiter,
    PDF_INSIGHT_KV: new FakeKv(),
  };
}

function analyzeRequest(ip: string, body = '{}'): Request {
  return new Request('https://api.test/analyze', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body,
  });
}

/** Incoming requests carry Cloudflare `cf` properties; the router does not read them. */
type IncomingRequest = Parameters<typeof worker.fetch>[0];

function call(request: Request, env: Env): Promise<Response> {
  return worker.fetch(request as IncomingRequest, env);
}

describe('rate limit on POST /analyze', () => {
  it('returns 429 rate_limited with Retry-After once the IP is over the limit', async () => {
    const env = makeEnv(fakeLimiter(10));

    // `{}` is an invalid body, so allowed requests stop at validation (400) without calling Gemini.
    for (let i = 0; i < 10; i += 1) {
      expect((await call(analyzeRequest('203.0.113.1'), env)).status).toBe(400);
    }
    const limited = await call(analyzeRequest('203.0.113.1'), env);

    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(limited.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });

  it('counts each IP separately', async () => {
    const env = makeEnv(fakeLimiter(1));

    expect((await call(analyzeRequest('203.0.113.1'), env)).status).toBe(400);
    expect((await call(analyzeRequest('203.0.113.1'), env)).status).toBe(429);
    expect((await call(analyzeRequest('203.0.113.2'), env)).status).toBe(400);
  });

  it('does not use the limiter for rejected origins or other routes', async () => {
    const limiter = fakeLimiter(10);
    const env = makeEnv(limiter);

    const foreign = new Request('https://api.test/analyze', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect((await call(foreign, env)).status).toBe(403);
    expect((await call(new Request('https://api.test/health'), env)).status).toBe(200);
    expect(limiter.limit).not.toHaveBeenCalled();
  });
});

describe('clientKey', () => {
  it('uses CF-Connecting-IP and falls back to a shared bucket', () => {
    expect(clientKey(analyzeRequest('198.51.100.7'))).toBe('198.51.100.7');
    expect(clientKey(new Request('https://api.test/analyze'))).toBe('unknown');
  });
});

describe('security headers', () => {
  it.each([
    ['GET /health', new Request('https://api.test/health')],
    ['404', new Request('https://api.test/nope')],
    [
      'OPTIONS preflight',
      new Request('https://api.test/analyze', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    ],
  ])('are set on %s', async (_label, request) => {
    const response = await call(request, makeEnv(fakeLimiter(10)));

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });
});
