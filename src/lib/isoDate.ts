/**
 * Helpers for the two ISO 8601 date precisions allowed by the contract (src/lib/schema.ts):
 * a full date "YYYY-MM-DD" and a year-month "YYYY-MM" (the document gives no day).
 */

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for "2026-10", false for "2026-10-15" or anything else. */
export function isYearMonth(value: string): boolean {
  return YEAR_MONTH.test(value);
}

/**
 * Chronological order of ISO dates. Plain string comparison is enough: both precisions start
 * with the same "YYYY-MM", and the shorter "2026-10" sorts before "2026-10-01" … "2026-10-31",
 * so a month comes before the days of that month.
 */
export function compareIsoDates(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
