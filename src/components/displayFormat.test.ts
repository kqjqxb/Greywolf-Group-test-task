import { describe, expect, it } from 'vitest';
import { formatAmountValue, formatRelativeTime, initials } from './displayFormat';

// Intl uses a narrow no-break space as the pl-PL group separator; normalise it for readability.
const plain = (text: string | null) => text?.replace(/\s/g, ' ');

describe('formatAmountValue', () => {
  it('formats with grouping and two decimals, without the currency', () => {
    expect(plain(formatAmountValue(184500))).toBe('184 500,00');
    expect(plain(formatAmountValue(8600))).toBe('8 600,00');
    expect(formatAmountValue(0.5)).toBe('0,50');
  });
});

describe('initials', () => {
  it('takes the first letters of the first and last word', () => {
    expect(initials('Jan Kowalski')).toBe('JK');
    expect(initials('Anna Maria Nowak')).toBe('AN');
    expect(initials('łukasz')).toBe('Ł');
  });

  it('ignores words that do not start with a letter', () => {
    expect(initials('dr. (Jan) Nowak')).toBe('DN');
    expect(initials('—')).toBe('?');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');

  it('describes recent times in Polish', () => {
    expect(formatRelativeTime('2026-11-04T11:59:30Z', now)).toBe('przed chwilą');
    expect(formatRelativeTime('2026-11-04T11:55:00Z', now)).toBe('5 minut temu');
    expect(formatRelativeTime('2026-11-04T09:00:00Z', now)).toBe('3 godziny temu');
    expect(formatRelativeTime('2026-11-03T12:00:00Z', now)).toBe('wczoraj');
    expect(formatRelativeTime('2026-11-01T12:00:00Z', now)).toBe('3 dni temu');
  });

  it('returns null for old, future or invalid dates', () => {
    expect(formatRelativeTime('2026-09-01T12:00:00Z', now)).toBeNull();
    expect(formatRelativeTime('2026-11-05T12:00:00Z', now)).toBeNull();
    expect(formatRelativeTime('nie-data', now)).toBeNull();
  });
});
