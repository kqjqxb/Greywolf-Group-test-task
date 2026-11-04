/**
 * Per-IP rate limit for `POST /analyze`, using the Cloudflare Workers Rate Limiting binding.
 * The limit itself (10 requests / 60 s) is configured in wrangler.toml [[ratelimits]].
 * Counters are per Cloudflare location and eventually consistent — good enough to stop one client
 * from burning the free LLM quota, not an exact global counter.
 */

/** Seconds a limited client should wait; equals the `period` in wrangler.toml. */
export const RATE_LIMIT_PERIOD_SECONDS = 60;

/** The part of the `RateLimit` binding we use (a plain interface, so tests can pass a fake). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Client IP set by Cloudflare. It cannot be spoofed by the client on Cloudflare's edge;
 * when it is missing (e.g. some local setups) all such requests share one bucket.
 */
export function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** True when the request may continue; false when this client is over the limit. */
export async function isWithinRateLimit(limiter: RateLimiter, request: Request): Promise<boolean> {
  const { success } = await limiter.limit({ key: clientKey(request) });
  return success;
}
