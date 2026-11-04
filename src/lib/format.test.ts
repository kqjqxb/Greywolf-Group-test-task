import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDate,
  formatDocumentType,
  formatLanguage,
  formatPageCount,
} from './format';

/** Intl uses non-breaking spaces; normalise them for readable assertions. */
const normalize = (text: string) => text.replace(/\s/g, ' ');

describe('formatAmount', () => {
  it('formats per currency in pl-PL', () => {
    expect(normalize(formatAmount(184500, 'PLN'))).toBe('184 500,00 zł');
    expect(normalize(formatAmount(8600, 'EUR'))).toBe('8600,00 €');
    expect(normalize(formatAmount(890, 'USD'))).toBe('890,00 USD');
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
