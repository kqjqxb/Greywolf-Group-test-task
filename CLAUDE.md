# CLAUDE.md — agent context for PDF Insight

Recruitment task with a hard 24 h deadline. Spec: `docs/BRIEF.md` (source of truth). Plan and progress: `PLAN.md`.
Human owner must be able to explain every line — prefer simple, explicit code over clever code.

## Architecture
- `src/` — React 18 + Vite + TypeScript (strict) SPA, deployed to GitHub Pages at `/Greywolf-Group-test-task/`.
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
(fill in once scaffolded)
