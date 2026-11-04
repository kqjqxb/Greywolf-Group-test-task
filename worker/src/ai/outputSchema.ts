import { z } from 'zod';
import { AnalysisResultSchema, DocumentInfoSchema } from '../../../src/lib/schema';

/**
 * What the model must produce for a document (or one chunk of it): the contract result without
 * `fileName` and `pages` (the worker fills those from the request).
 */
export const ModelOutputSchema = AnalysisResultSchema.extend({
  document: DocumentInfoSchema.omit({ fileName: true, pages: true }),
});

/** What the model must produce in the final step of a chunked analysis (F-08): one summary. */
export const SummaryOutputSchema = z.object({
  summary: z.string().min(1),
});

/**
 * Which of the two output schemas a call uses. Every provider turns each Zod schema into its own
 * JSON Schema dialect once, at module load (single source of truth: the Zod contract).
 */
export type OutputKind = 'analysis' | 'summary';

export const OUTPUT_SCHEMAS = {
  analysis: ModelOutputSchema,
  summary: SummaryOutputSchema,
} as const satisfies Record<OutputKind, z.ZodType>;
