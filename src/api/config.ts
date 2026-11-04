/** Base URL of the Cloudflare Worker API (set via VITE_API_URL at build time). */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
