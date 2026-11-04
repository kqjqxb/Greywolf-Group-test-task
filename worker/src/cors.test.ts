import { describe, expect, it } from 'vitest';
import { isOriginAllowed, parseAllowedOrigins, withCors } from './cors';

const PROD = 'https://kqjqxb.github.io';
const LOCAL = 'http://localhost:5173';

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedOrigins(`${PROD}, ${LOCAL} `)).toEqual([PROD, LOCAL]);
  });

  it('ignores empty entries and missing config', () => {
    expect(parseAllowedOrigins(`${PROD},,`)).toEqual([PROD]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  const allowed = [PROD, LOCAL];

  it('accepts an exact match', () => {
    expect(isOriginAllowed(PROD, allowed)).toBe(true);
    expect(isOriginAllowed(LOCAL, allowed)).toBe(true);
  });

  it('rejects a missing, empty or "null" origin', () => {
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });

  it('rejects look-alike origins (suffix, prefix, scheme, port, path, case)', () => {
    expect(isOriginAllowed('https://kqjqxb.github.io.evil.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://evil-kqjqxb.github.io', allowed)).toBe(false);
    expect(isOriginAllowed('http://kqjqxb.github.io', allowed)).toBe(false);
    expect(isOriginAllowed('https://kqjqxb.github.io:8443', allowed)).toBe(false);
    expect(isOriginAllowed('https://kqjqxb.github.io/', allowed)).toBe(false);
    expect(isOriginAllowed('https://KQJQXB.github.io', allowed)).toBe(false);
  });

  it('rejects everything when the allowlist is empty', () => {
    expect(isOriginAllowed(PROD, [])).toBe(false);
  });
});

describe('withCors', () => {
  it('adds CORS headers and Vary for an allowed origin', () => {
    const response = withCors(new Response('{}', { status: 200 }), PROD);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(PROD);
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('adds only Vary for a disallowed origin', () => {
    const response = withCors(new Response('{}', { status: 403 }), null);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Vary')).toBe('Origin');
  });
});
