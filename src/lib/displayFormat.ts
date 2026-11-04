/**
 * Presentation-only formatting for the redesigned result and history cards (Polish locale).
 * The shared, tested formatters stay in src/lib/format.ts; these only split or shorten them.
 */

const LOCALE = 'pl-PL';

/** 12500 → "12 500,00" (the currency is shown separately as a badge). */
export function formatAmountValue(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  }).format(value);
}

/** "Jan Kowalski" → "JK", "Anna" → "A"; for the avatar circle next to a person. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .map((word) => word.charAt(0).toLocaleUpperCase(LOCALE));
  if (letters.length === 0) {
    return '?';
  }
  return letters.length === 1 ? (letters[0] ?? '?') : `${letters[0] ?? ''}${letters.at(-1) ?? ''}`;
}

const NBSP = '\u00A0';

/**
 * Polish legal-form suffixes, longest first so "sp. k." does not swallow part of "S.K.A.".
 * Whitespace inside a suffix is optional ("sp.k." and "sp. k." both match).
 */
const LEGAL_SUFFIX =
  /\s+(sp\.\s*z\s*o\.\s*o\.|s\.\s*k\.\s*a\.|sp\.\s*[kjp]\.|s\.\s*[ac]\.)(?=$|[\s,;)])/giu;

/**
 * "Nordwave Logistics sp. z o.o." → the same text with no-break spaces before and inside the
 * legal form, so a line never breaks inside "sp. z o.o." or before "S.A.". Display only:
 * the exported JSON keeps the original string.
 */
export function keepLegalSuffixTogether(name: string): string {
  return name.replace(
    LEGAL_SUFFIX,
    (_match, suffix: string) => NBSP + suffix.replace(/\s+/g, NBSP),
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "przed chwilą", "5 minut temu", "wczoraj", "3 dni temu"; null after 30 days (or for a future
 * or invalid date), so the caller shows the absolute date instead.
 */
export function formatRelativeTime(isoDateTime: string, now: number): string | null {
  const time = new Date(isoDateTime).getTime();
  const diff = now - time;
  if (Number.isNaN(time) || diff < 0 || diff >= 30 * DAY) {
    return null;
  }
  if (diff < MINUTE) {
    return 'przed chwilą';
  }
  const format = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (diff < HOUR) {
    return format.format(-Math.floor(diff / MINUTE), 'minute');
  }
  if (diff < DAY) {
    return format.format(-Math.floor(diff / HOUR), 'hour');
  }
  return format.format(-Math.floor(diff / DAY), 'day');
}
