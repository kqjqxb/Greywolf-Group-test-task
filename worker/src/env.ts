export interface Env {
  /** Secret, set with `wrangler secret put GEMINI_API_KEY` (locally in worker/.dev.vars). */
  GEMINI_API_KEY: string;
  /**
   * Frontend origins allowed by CORS, comma-separated (e.g. "https://a.com,http://localhost:5173").
   * Set in wrangler.toml [vars]; overridden locally in worker/.dev.vars.
   */
  ALLOWED_ORIGIN: string;
}
