import { z } from 'zod';
import { OUTPUT_SCHEMAS, type OutputKind } from './outputSchema';
import type { ModelProvider, ProviderCall, ProviderResult } from './provider';

/** Gemini REST API (generateContent), called with plain fetch — no SDK. */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
 * Response schemas for Gemini, derived from the Zod contract (single source of truth).
 * `pattern` is dropped (regexes are checked by Zod afterwards); `format: "date"`, enums,
 * `minItems`/`maxItems` and nullable `anyOf` are kept because Gemini supports them.
 */
export const GEMINI_RESPONSE_SCHEMAS: Record<OutputKind, unknown> = {
  analysis: stripUnsupportedKeys(z.toJSONSchema(OUTPUT_SCHEMAS.analysis)),
  summary: stripUnsupportedKeys(z.toJSONSchema(OUTPUT_SCHEMAS.summary)),
};

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

function buildBody(request: ProviderCall): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: request.systemInstruction }] },
    contents: request.messages.map((message) => ({
      // Gemini calls the assistant role "model".
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.text }],
    })),
    generationConfig: {
      // Low temperature for repeatable extraction (newer models may ignore it).
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: GEMINI_RESPONSE_SCHEMAS[request.output],
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
export async function callGemini(
  apiKey: string,
  model: string,
  request: ProviderCall,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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

/** Gemini model as a provider of the chain (free tier, so it does not use the Claude budget). */
export function createGeminiProvider(apiKey: string, model: string): ModelProvider {
  return {
    model,
    paid: false,
    call: (request) => callGemini(apiKey, model, request),
  };
}
