import { z } from 'zod';
import type { CompletedAnalysis } from './analysisState';
import { AnalysisResultSchema, AnalyzeMetaSchema } from './schema';

/**
 * F-09: the last analyses, kept only in this browser's localStorage.
 * Storage can be missing, full or blocked (private mode, disabled cookies), and the stored JSON
 * can be edited or corrupted by anyone with DevTools, so: every access is in try/catch, and every
 * entry is validated with Zod on read (invalid ones are dropped, never shown).
 */

export const HISTORY_STORAGE_KEY = 'pdf-insight:history:v1';
export const MAX_HISTORY_ENTRIES = 10;

/** The subset of the Web Storage API we use (lets tests pass an in-memory fake). */
export type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PageNumbers = z.array(z.number().int().positive());

const HistoryEntrySchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  result: AnalysisResultSchema,
  meta: AnalyzeMetaSchema.nullable(),
  findings: z.object({
    emptyPages: PageNumbers,
    ocrPages: PageNumbers,
    ocrLimitReached: z.boolean(),
    injectionSuspected: z.boolean(),
  }),
  analyzedAt: z.iso.datetime(),
});

export type HistoryEntry = CompletedAnalysis & { id: string };

/** localStorage, or null when the browser does not let us touch it (the getter itself can throw). */
export function browserStorage(): HistoryStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the history, newest first. Corrupted JSON gives [], invalid entries are skipped. */
export function loadHistory(storage: HistoryStorage | null): HistoryEntry[] {
  if (storage === null) {
    return [];
  }
  let parsed: unknown;
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .flatMap((item) => {
      const entry = HistoryEntrySchema.safeParse(item);
      return entry.success ? [entry.data] : [];
    })
    .slice(0, MAX_HISTORY_ENTRIES);
}

/**
 * Writes the list. When storage is full (QuotaExceededError), the oldest entries are dropped one
 * by one until it fits. Returns the list that was actually saved ([] if nothing could be).
 */
function saveHistory(storage: HistoryStorage | null, entries: HistoryEntry[]): HistoryEntry[] {
  if (storage === null) {
    return entries;
  }
  for (let count = entries.length; count > 0; count--) {
    const kept = entries.slice(0, count);
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(kept));
      return kept;
    } catch {
      // Too big (or storage blocked): try again with one entry fewer.
    }
  }
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing more we can do; the history is just not persisted.
  }
  return [];
}

/**
 * Adds a finished analysis at the top and keeps the newest MAX_HISTORY_ENTRIES.
 * Returns the new list for the UI. Without storage the entry lives only until a reload.
 */
export function addToHistory(
  storage: HistoryStorage | null,
  current: readonly HistoryEntry[],
  analysis: CompletedAnalysis,
  id: string,
): HistoryEntry[] {
  return saveHistory(storage, [{ ...analysis, id }, ...current].slice(0, MAX_HISTORY_ENTRIES));
}

export function removeFromHistory(
  storage: HistoryStorage | null,
  current: readonly HistoryEntry[],
  id: string,
): HistoryEntry[] {
  const entries = current.filter((entry) => entry.id !== id);
  // If saving fails we still hide the entry for now; it may come back after a reload.
  saveHistory(storage, entries);
  return entries;
}

export function clearHistory(storage: HistoryStorage | null): HistoryEntry[] {
  try {
    storage?.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Storage blocked: the list is cleared in the UI anyway.
  }
  return [];
}
