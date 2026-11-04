/**
 * Base URL of the Cloudflare Worker API (set via VITE_API_URL at build time).
 * An empty value falls back to the local worker; a trailing slash is removed so paths join cleanly.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
);
