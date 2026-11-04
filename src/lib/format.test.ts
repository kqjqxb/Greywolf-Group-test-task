import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatDocumentType,
  formatLanguage,
  formatPageCount,
} from './format';

/** Intl uses non-breaking spaces; normalise them for readable assertions. */
const normalize = (text: string) => text.replace(/\s/g, ' ');

describe('formatAmount', () => {
  it('formats per currency in pl-PL', () => {
    expect(normalize(formatAmount(184500, 'PLN'))).toBe('184 500,00 zł');
    expect(normalize(formatAmount(890, 'USD'))).toBe('890,00 USD');
  });

  it.each([
    [8600, 'EUR', '8 600,00 €'],
    [1234.5, 'PLN', '1 234,50 zł'],
    [13100, 'PLN', '13 100,00 zł'],
    [42435, 'PLN', '42 435,00 zł'],
    [184500, 'PLN', '184 500,00 zł'],
    [226935, 'PLN', '226 935,00 zł'],
  ])('groups thousands for 4-, 5- and 6-digit values: %d %s → %s', (value, currency, expected) => {
    expect(normalize(formatAmount(value, currency))).toBe(expected);
  });

  it('falls back to the raw value for an unknown currency code', () => {
    expect(formatAmount(10, 'nope')).toBe('10 nope');
  });
});

describe('formatDate', () => {
  it('formats an ISO date in Polish without timezone shift', () => {
    expect(formatDate('2026-10-01')).toBe('1 października 2026');
    expect(formatDate('2027-04-01')).toBe('1 kwietnia 2027');
  });

  it('returns invalid input unchanged', () => {
    expect(formatDate('nie-data')).toBe('nie-data');
  });
});

describe('formatLanguage', () => {
  it('shows the Polish language name', () => {
    expect(formatLanguage('pl')).toBe('polski');
    expect(formatLanguage('en')).toBe('angielski');
  });
});

describe('formatDocumentType', () => {
  it('labels document types', () => {
    expect(formatDocumentType('umowa')).toBe('Umowa');
    expect(formatDocumentType('inne')).toBe('Inny dokument');
  });
});

describe('formatPageCount', () => {
  it.each([
    [1, '1 strona'],
    [2, '2 strony'],
    [4, '4 strony'],
    [5, '5 stron'],
    [12, '12 stron'],
    [14, '14 stron'],
    [22, '22 strony'],
    [25, '25 stron'],
  ])('%i → %s', (pages, expected) => {
    expect(formatPageCount(pages)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it('shows seconds with one decimal and "< 1 s" for fast (cached) results', () => {
    expect(formatDuration(4230)).toBe('4,2 s');
    expect(formatDuration(12000)).toBe('12 s');
    expect(formatDuration(3)).toBe('< 1 s');
  });
});

describe('formatDateTime', () => {
  it('formats a valid date-time and returns the input when invalid', () => {
    expect(formatDateTime('2026-11-04T12:30:00.000Z')).toMatch(/2026/);
    expect(formatDateTime('wczoraj')).toBe('wczoraj');
  });
});
