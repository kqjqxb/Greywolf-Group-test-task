import type { DocumentType } from './schema';

const LOCALE = 'pl-PL';

/**
 * "12500, PLN" → "12 500,00 zł". Falls back to "12500 XYZ" if Intl rejects the code.
 * `useGrouping: 'always'`: by default pl-PL does not group 4-digit numbers ("8600,00 €"),
 * which looks inconsistent next to "184 500,00 zł" in the same list.
 */
export function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      useGrouping: 'always',
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/**
 * "2026-10-01" → "1 października 2026". Formatted in UTC, because a plain ISO date parsed
 * as local time could shift to the previous day in timezones west of UTC.
 */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** "pl" → "polski". Falls back to the raw code. */
export function formatLanguage(code: string): string {
  try {
    return new Intl.DisplayNames([LOCALE], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  faktura: 'Faktura',
  umowa: 'Umowa',
  oferta: 'Oferta',
  raport: 'Raport',
  inne: 'Inny dokument',
};

export function formatDocumentType(type: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[type];
}

/** Polish plural for "strona": 1 strona, 2 strony, 5 stron, 22 strony. */
export function formatPageCount(pages: number): string {
  const lastDigit = pages % 10;
  const lastTwo = pages % 100;
  if (pages === 1) {
    return '1 strona';
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${pages} strony`;
  }
  return `${pages} stron`;
}
