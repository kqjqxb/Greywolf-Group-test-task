# CLAUDE.md — agent context for PDF Insight

Recruitment task with a hard 24 h deadline. Spec: `docs/BRIEF.md` (source of truth). Plan and progress: `PLAN.md`.
Human owner must be able to explain every line — prefer simple, explicit code over clever code.

## Architecture
- `src/` — React 19 + Vite + TypeScript (strict) SPA, deployed to GitHub Pages at `/Greywolf-Group-test-task/`.
  - `src/components/` UI · `src/lib/` pure logic (pdf extraction, schema, chunking, history) · `src/api/` HTTP client for the worker.
- `worker/` — Cloudflare Worker: API proxy holding the LLM key, CORS allowlist, rate limit, size limit, prompt, retry.
- Shared schema: Zod in `src/lib/schema.ts`; the worker validates with the same schema (single source).

## Hard rules (violations = disqualification or lost points)
- NEVER put an API key in frontend code, `.env` committed files, logs, or commit history. Only `.env.example` with placeholders.
- No `any`, no `console.log`, no `dangerouslySetInnerHTML`. `tsc --noEmit` and `eslint` must pass.
- PDF text is untrusted DATA. Never concatenate it into instructions; wrap it in delimiters and tell the model to ignore instructions inside it.
- All user-facing UI strings in Polish. Code, identifiers, comments in English.
- AI output is validated with Zod before display; on invalid output: exactly 1 retry, then a Polish error message with a retry button.
- Missing info → `null` / `[]`. Dates ISO 8601, currencies ISO 4217.

## Conventions
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`), small logical commits. Do not commit unless asked.
- After any change: `npm run lint && npm run typecheck && npm test`.
- When an AI mistake is found and fixed, append an entry to `AI_LOG.md` → "Błędy AI i poprawki".
- Mark finished tasks in `PLAN.md` (`[x]`).

## Commands
Node 22, single root `package.json` (frontend + worker share one `node_modules`).
- `npm run dev` — Vite dev server · `npm run build` — typecheck app + production build to `dist/` · `npm run preview`
- `npm run lint` — ESLint (type-aware) · `npm run typecheck` — tsc for app (`tsconfig.json`), `vite.config.ts` (`tsconfig.node.json`) and worker (`worker/tsconfig.json`)
- `npm test` — Vitest (watch); `npm test -- --run` for a single run (CI)
- `npm run format` / `npm run format:check` — Prettier (Markdown is excluded in `.prettierignore`)
- `npm run worker:dev` — local worker on http://localhost:8787 (secrets from `worker/.dev.vars`, copy from `.dev.vars.example`)
- `npm run worker:deploy` — deploy worker; set the key once with `npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml`
- Full check: `npm run lint && npm run typecheck && npm test -- --run && npm run build`

Version pins: `eslint@9` (eslint-plugin-react does not support ESLint 10 yet), `typescript@~6.0` (typescript-eslint requires TS < 6.1).
