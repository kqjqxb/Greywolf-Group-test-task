import { z } from 'zod';

/**
 * CONTRACT between frontend and worker (docs/BRIEF.md, section "Schemat wyniku").
 * Owned by the orchestrator: stage agents must not change shapes here without approval.
 * Fields may be added, never removed (brief rule).
 */

/** Body of `POST /analyze`, sent by the frontend and validated by the worker. */
export const AnalyzeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().positive(),
  text: z.string().min(1),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const DOCUMENT_TYPES = ['faktura', 'umowa', 'oferta', 'raport', 'inne'] as const;

/** ISO 8601 calendar date, e.g. "2026-03-12". */
const IsoDate = z.iso.date();

/** ISO 4217 currency code, e.g. "PLN". */
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const DocumentInfoSchema = z.object({
  /** Filled by the worker from the request, never by the model. */
  fileName: z.string().min(1),
  /** Filled by the worker from the request, never by the model. */
  pages: z.number().int().positive(),
  /** ISO 639-1, lowercase, e.g. "pl". */
  language: z.string().regex(/^[a-z]{2}$/),
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().min(1).nullable(),
  date: IsoDate.nullable(),
});

export const AmountSchema = z.object({
  value: z.number(),
  currency: CurrencyCode,
  context: z.string().min(1),
});

export const DateEntrySchema = z.object({
  date: IsoDate,
  context: z.string().min(1),
});

/**
 * Full analysis result. `summary` length (3–5 sentences) is enforced separately
 * by the worker's validation step, because sentence counting needs abbreviation handling.
 */
export const AnalysisResultSchema = z.object({
  document: DocumentInfoSchema,
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(7),
  entities: z.object({
    organizations: z.array(z.string().min(1)),
    people: z.array(z.string().min(1)),
  }),
  amounts: z.array(AmountSchema),
  dates: z.array(DateEntrySchema),
  keywords: z.array(z.string().min(1)),
});

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Diagnostics about how the result was produced (not part of the exported JSON result). */
export const AnalyzeMetaSchema = z.object({
  /** Model that produced the result (e.g. "claude-haiku-5-5" or a Gemini fallback model). */
  model: z.string(),
  /** Version of the worker prompt (worker/src/ai/prompt.ts). */
  promptVersion: z.string(),
  /** Time the worker spent on the AI part of the request, in milliseconds. */
  durationMs: z.number(),
  /** True when the result was served from the worker's result cache (no AI call). */
  cached: z.boolean().optional(),
  /** Number of text chunks the document was split into (1 = no chunking, F-08). */
  chunks: z.number().int().positive().optional(),
});
export type AnalyzeMeta = z.infer<typeof AnalyzeMetaSchema>;

/** Successful `POST /analyze` response body. */
export const AnalyzeResponseSchema = z.object({
  result: AnalysisResultSchema,
  meta: AnalyzeMetaSchema.optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/** Error codes the worker can return as `{ error: <code> }` (frontend maps them to Polish messages). */
export const API_ERROR_CODES = [
  'not_found',
  'method_not_allowed',
  'forbidden_origin',
  'unsupported_media_type',
  'payload_too_large',
  'invalid_json',
  'invalid_body',
  'rate_limited',
  'ai_unavailable',
  'ai_invalid_response',
  'ai_timeout',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export const ApiErrorSchema = z.object({ error: z.enum(API_ERROR_CODES) });
