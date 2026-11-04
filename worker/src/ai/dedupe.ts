import type { z } from 'zod';
import { compareIsoDates } from '../../../src/lib/isoDate';
import type { AmountSchema, DateEntrySchema } from '../../../src/lib/schema';

/**
 * Deterministic clean-up of list fields. Used after validating every model answer (so the rules
 * hold for every provider) and when merging chunk results (F-08).
 */

type Amount = z.infer<typeof AmountSchema>;
type DateEntry = z.infer<typeof DateEntrySchema>;

/** Comparison key: trimmed, single spaces, lowercase ("Kwadrat  Software " ≡ "kwadrat software"). */
export function comparisonKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Removes case-insensitive duplicates, keeping the first spelling and the original order. */
export function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = comparisonKey(value);
    if (key !== '' && !seen.has(key)) {
      seen.add(key);
      result.push(value.trim());
    }
  }
  return result;
}

/** Removes amounts with the same value, currency and (case-insensitive) context. */
export function dedupeAmounts(amounts: readonly Amount[]): Amount[] {
  const seen = new Set<string>();
  return amounts.filter((amount) => {
    const key = `${amount.value}|${amount.currency}|${comparisonKey(amount.context)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Exactly one entry per date: entries with the same date string are merged and every distinct
 * event is kept, joined with "; ". A context the model already merged ("a; b") is split first,
 * so merging it with "b" gives "a; b", not "a; b; b". "2026-10" (month only) and "2026-10-15"
 * are different entries. The result is sorted chronologically, a month before its days.
 */
export function mergeDates(dates: readonly DateEntry[]): DateEntry[] {
  const contextsByDate = new Map<string, string[]>();
  for (const entry of dates) {
    const contexts = contextsByDate.get(entry.date) ?? [];
    contexts.push(...entry.context.split(';'));
    contextsByDate.set(entry.date, contexts);
  }
  return [...contextsByDate.entries()]
    .sort(([a], [b]) => compareIsoDates(a, b))
    .map(([date, contexts]) => ({ date, context: dedupeStrings(contexts).join('; ') }));
}
