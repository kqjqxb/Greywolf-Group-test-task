import { describe, expect, it } from 'vitest';
import { dedupeStrings, mergeDates } from './dedupe';

describe('mergeDates', () => {
  it('merges entries with the same date and keeps every distinct event', () => {
    expect(
      mergeDates([
        { date: '2024-03-01', context: 'end of freelance work' },
        { date: '2024-03-01', context: 'start at Upstars' },
      ]),
    ).toEqual([{ date: '2024-03-01', context: 'end of freelance work; start at Upstars' }]);
  });

  it('does not repeat an event the model already merged into one context', () => {
    expect(
      mergeDates([
        { date: '2024-03-01', context: 'end of freelance work; start at Upstars' },
        { date: '2024-03-01', context: 'Start at Upstars' },
      ]),
    ).toEqual([{ date: '2024-03-01', context: 'end of freelance work; start at Upstars' }]);
  });

  it('keeps a year-month and a full date of the same month as separate entries', () => {
    const merged = mergeDates([
      { date: '2026-10-15', context: 'review meeting' },
      { date: '2026-10', context: 'end of employment' },
    ]);
    expect(merged).toEqual([
      { date: '2026-10', context: 'end of employment' },
      { date: '2026-10-15', context: 'review meeting' },
    ]);
  });

  it('merges two year-month entries of the same month', () => {
    expect(
      mergeDates([
        { date: '2026-10', context: 'end of the project' },
        { date: '2026-10', context: 'end of employment' },
      ]),
    ).toEqual([{ date: '2026-10', context: 'end of the project; end of employment' }]);
  });

  it('sorts mixed precisions chronologically', () => {
    const merged = mergeDates([
      { date: '2027-01', context: 'c' },
      { date: '2026-10-01', context: 'b' },
      { date: '2026-10', context: 'a' },
      { date: '2024-03-01', context: 'z' },
    ]);
    expect(merged.map((entry) => entry.date)).toEqual([
      '2024-03-01',
      '2026-10',
      '2026-10-01',
      '2027-01',
    ]);
  });
});

describe('dedupeStrings', () => {
  it('drops empty values and case-insensitive duplicates', () => {
    expect(dedupeStrings(['Upstars', ' upstars ', '', 'Nearby Delivery'])).toEqual([
      'Upstars',
      'Nearby Delivery',
    ]);
  });
});
