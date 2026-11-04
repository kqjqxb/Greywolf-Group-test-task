import type { KeyValueStore } from './kv';

export interface Env {
  /** Secret, set with `wrangler secret put GEMINI_API_KEY` (locally in worker/.dev.vars). */
  GEMINI_API_KEY: string;
  /**
   * Secret, set with `wrangler secret put ANTHROPIC_API_KEY` (locally in worker/.dev.vars).
   * Prepaid credit: without it (or over the daily limit) Claude is skipped and Gemini is used.
   */
  ANTHROPIC_API_KEY?: string;
  /**
   * Frontend origins allowed by CORS, comma-separated (e.g. "https://a.com,http://localhost:5173").
   * Set in wrangler.toml [vars]; overridden locally in worker/.dev.vars.
   */
  ALLOWED_ORIGIN: string;
  /** Primary model: Claude model id, e.g. "claude-haiku-5-5". Public, wrangler.toml [vars]. */
  CLAUDE_MODEL?: string;
  /** Max Claude calls per UTC day (approximate, see budget.ts). Public, wrangler.toml [vars]. */
  CLAUDE_DAILY_LIMIT?: string;
  /** Gemini model used after Claude, e.g. "gemini-3.6-flash". Public, set in wrangler.toml [vars]. */
  GEMINI_MODEL: string;
  /**
   * Last model of the chain, tried when the previous ones are unavailable, time out or hit their
   * quota (429). Public, set in wrangler.toml [vars]; an empty value disables it.
   */
  GEMINI_FALLBACK_MODEL?: string;
  /** Cloudflare Rate Limiting binding for `POST /analyze` (wrangler.toml [[ratelimits]]). */
  ANALYZE_RATE_LIMITER: RateLimit;
  /**
   * KV namespace (wrangler.toml [[kv_namespaces]]) for the result cache (cache.ts) and the Claude
   * daily counter (budget.ts). Typed as the small subset we use, so tests can pass a fake.
   */
  PDF_INSIGHT_KV: KeyValueStore;
}
