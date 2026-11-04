import { z } from 'zod';

/**
 * Zod can speed up object parsing by compiling code with `new Function`, which our
 * Content-Security-Policy forbids (no 'unsafe-eval'). Even its feature probe is reported as a
 * CSP violation, so we switch to the interpreted mode up front — same results, no eval.
 * Imported first in main.tsx, before any schema is used.
 */
z.config({ jitless: true });
