export interface Env {
  /** Secret, set with `wrangler secret put GEMINI_API_KEY` (locally in worker/.dev.vars). */
  GEMINI_API_KEY: string;
  /**
   * Frontend origins allowed by CORS, comma-separated (e.g. "https://a.com,http://localhost:5173").
   * Set in wrangler.toml [vars]; overridden locally in worker/.dev.vars.
   */
  ALLOWED_ORIGIN: string;
  /** Primary Gemini model id, e.g. "gemini-3.6-flash". Public, set in wrangler.toml [vars]. */
  GEMINI_MODEL: string;
  /**
   * Model tried when the primary one is unavailable, times out or hits its quota (429).
   * Public, set in wrangler.toml [vars]; an empty value disables the fallback.
   */
  GEMINI_FALLBACK_MODEL?: string;
  /** Cloudflare Rate Limiting binding for `POST /analyze` (wrangler.toml [[ratelimits]]). */
  ANALYZE_RATE_LIMITER: RateLimit;
}
