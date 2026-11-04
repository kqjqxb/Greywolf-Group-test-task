/** Splits the comma-separated ALLOWED_ORIGIN value into a clean list of origins. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * True only for an exact, case-sensitive match against the allowlist.
 * No wildcards and no prefix/suffix matching, so "https://site.io.evil.com" never matches "https://site.io".
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: readonly string[]): boolean {
  if (origin === null || origin === '') {
    return false;
  }
  return allowedOrigins.includes(origin);
}

/** CORS headers for an origin that already passed `isOriginAllowed`. */
export function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Returns a copy of the response with CORS headers (only for an allowed origin) and `Vary: Origin`.
 * `Vary` is always set because the response differs per Origin, so caches must not mix them.
 */
export function withCors(response: Response, allowedOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.append('Vary', 'Origin');
  if (allowedOrigin !== null) {
    for (const [name, value] of Object.entries(corsHeaders(allowedOrigin))) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, { status: response.status, headers });
}
