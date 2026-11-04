import { z } from 'zod';
import { AnalysisResultSchema, DocumentInfoSchema } from '../../../src/lib/schema';

/** Gemini REST API (generateContent), called with plain fetch — no SDK. */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Per-call timeout. Keeps one attempt well below the 30 s Definition of Done. */
export const GEMINI_TIMEOUT_MS = 20_000;

/** One turn of the conversation sent to Gemini. */
export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiRequest {
  apiKey: string;
  model: string;
  systemInstruction: string;
  messages: readonly GeminiMessage[];
  timeoutMs?: number;
}

/** Outcome of one call. Errors carry only a category — never the upstream message or the key. */
export type GeminiResult =
  { ok: true; text: string } | { ok: false; error: 'rate_limited' | 'timeout' | 'unavailable' };

/**
 * What the model must produce: the contract result without `fileName` and `pages`
 * (the worker fills those from the request).
 */
export const ModelOutputSchema = AnalysisResultSchema.extend({
  document: DocumentInfoSchema.omit({ fileName: true, pages: true }),
});

/** JSON Schema keywords that Gemini's structured output does not support (or we do not want to send). */
const UNSUPPORTED_SCHEMA_KEYS = new Set(['$schema', 'pattern']);

/** Recursively copies a JSON Schema without the unsupported keywords. */
function stripUnsupportedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!UNSUPPORTED_SCHEMA_KEYS.has(key)) {
        copy[key] = stripUnsupportedKeys(child);
      }
    }
    return copy;
  }
  return value;
}

/**
 * Response schema for Gemini, derived from the Zod contract (single source of truth).
 * `pattern` is dropped (regexes are checked by Zod afterwards); `format: "date"`, enums,
 * `minItems`/`maxItems` and nullable `anyOf` are kept because Gemini supports them.
 */
export const RESPONSE_JSON_SCHEMA = stripUnsupportedKeys(z.toJSONSchema(ModelOutputSchema));

/** The part of the generateContent response we read; everything else is ignored. */
const GenerateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
});

function buildBody(request: GeminiRequest): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: request.systemInstruction }] },
    contents: request.messages.map((message) => ({
      role: message.role,
      parts: [{ text: message.text }],
    })),
    generationConfig: {
      // Low temperature for repeatable extraction (newer models may ignore it).
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      // Gemini 3 models think dynamically by default, which can push a 12-page document
      // close to the timeout. Extraction needs little reasoning, so "LOW" keeps latency down.
      // (thinkingLevel is a Gemini 3+ option; older models would need thinkingBudget instead.)
      thinkingConfig: { thinkingLevel: 'LOW' },
    },
  });
}

/**
 * Calls Gemini once. The key goes in the `x-goog-api-key` header (never in the URL, which may be logged).
 * Returns the model's raw text (expected to be JSON); an empty string when the model returned nothing,
 * so the caller treats it as an invalid answer.
 */
export async function callGemini(request: GeminiRequest): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${encodeURIComponent(request.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: buildBody(request),
        signal: controller.signal,
      },
    );

    if (response.status === 429) {
      return { ok: false, error: 'rate_limited' };
    }
    if (!response.ok) {
      return { ok: false, error: 'unavailable' };
    }

    const parsed = GenerateContentResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, error: 'unavailable' };
    }
    const parts = parsed.data.candidates?.[0]?.content?.parts ?? [];
    // Skip "thought" parts (thinking models); join the actual answer.
    const text = parts
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? '')
      .join('');
    return { ok: true, text };
  } catch {
    // AbortController fires when the timeout elapses; anything else is a network failure.
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
