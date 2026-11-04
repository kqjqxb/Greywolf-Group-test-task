import { z } from 'zod';

/**
 * Body of `POST /analyze`, sent by the frontend and validated by the worker.
 * Shared by both sides so the contract has a single source of truth.
 */
export const AnalyzeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  pages: z.number().int().positive(),
  text: z.string().min(1),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
