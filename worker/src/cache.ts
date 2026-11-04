import { z } from 'zod';
import { AnalysisResultSchema, type AnalysisResult } from '../../src/lib/schema';
import { PROMPT_VERSION } from './ai/prompt';
import type { KeyValueStore } from './kv';

/**
 * Result cache in KV: the same document text (with the same prompt version) is analyzed only once.
 * - Key: SHA-256 of PROMPT_VERSION + "\n" + normalized text. It does not depend on the file name,
 *   and a new prompt version automatically misses the old entries.
 * - Value: only the validated result and how it was produced — never the document text.
 * - Entries expire after 14 days.
 */

export const CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;

const CachedEntrySchema = z.object({
  result: AnalysisResultSchema,
  model: z.string(),
  chunks: z.number().int().positive(),
});
export type CachedEntry = z.infer<typeof CachedEntrySchema>;

/** Unicode NFC, "\n" line ends, no trailing spaces, trimmed — so trivial differences still hit. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export async function cacheKey(text: string): Promise<string> {
  const data = new TextEncoder().encode(`${PROMPT_VERSION}\n${normalizeText(text)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `result:${hex}`;
}

/** The cached entry, or null on a miss, a KV error or an entry that no longer matches the contract. */
export async function readCachedResult(
  store: KeyValueStore,
  key: string,
): Promise<CachedEntry | null> {
  try {
    const raw = await store.get(key);
    if (raw === null) {
      return null;
    }
    const parsed = CachedEntrySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stores a validated result. Never throws: a failed write only means the next request misses. */
export async function writeCachedResult(
  store: KeyValueStore,
  key: string,
  entry: { result: AnalysisResult; model: string; chunks: number },
): Promise<void> {
  try {
    await store.put(key, JSON.stringify(entry), { expirationTtl: CACHE_TTL_SECONDS });
  } catch {
    // Ignored on purpose (see above).
  }
}
