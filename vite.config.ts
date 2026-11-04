import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Same fallback as src/api/config.ts: the local worker. */
const DEFAULT_API_URL = 'http://localhost:8787';

/**
 * Content-Security-Policy for the production page. The app only needs its own files, the worker
 * API (connect-src) and a blob: worker for pdf.js; everything else (inline scripts, plugins,
 * other hosts) is blocked, which limits the damage of any XSS bug.
 */
function contentSecurityPolicy(apiUrl: string): string {
  const apiOrigin = new URL(apiUrl).origin;
  return [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "worker-src 'self' blob:",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

/**
 * Adds the CSP as a <meta> tag (GitHub Pages cannot set HTTP headers). Build only: the dev server
 * injects inline scripts for React Fast Refresh, which this policy would block.
 */
function cspPlugin(apiUrl: string): Plugin {
  return {
    name: 'pdf-insight-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: contentSecurityPolicy(apiUrl),
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// GitHub Pages serves the app from /<repo>/, so all asset URLs need this prefix.
export default defineConfig(({ mode }) => {
  // VITE_API_URL from .env files or the environment (CI sets it as a GitHub Actions variable).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: '/Greywolf-Group-test-task/',
    plugins: [react(), cspPlugin(env.VITE_API_URL || DEFAULT_API_URL)],
    test: {
      include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'eval/**/*.test.ts'],
    },
  };
});
