import { describe, expect, it } from 'vitest';
import { compareIsoDates, isYearMonth } from './isoDate';

describe('isYearMonth', () => {
  it('accepts only YYYY-MM with a valid month', () => {
    expect(isYearMonth('2026-10')).toBe(true);
    expect(isYearMonth('2026-01')).toBe(true);
    expect(isYearMonth('2026-13')).toBe(false);
    expect(isYearMonth('2026-10-15')).toBe(false);
    expect(isYearMonth('10/2026')).toBe(false);
  });
});

describe('compareIsoDates', () => {
  it('sorts both precisions chronologically, a month before the days of that month', () => {
    const dates = ['2026-10-15', '2027-01', '2026-10', '2024-03-01', '2026-09-30', '2026-11'];
    expect([...dates].sort(compareIsoDates)).toEqual([
      '2024-03-01',
      '2026-09-30',
      '2026-10',
      '2026-10-15',
      '2026-11',
      '2027-01',
    ]);
  });

  it('returns 0 for equal dates', () => {
    expect(compareIsoDates('2026-10', '2026-10')).toBe(0);
  });
});
