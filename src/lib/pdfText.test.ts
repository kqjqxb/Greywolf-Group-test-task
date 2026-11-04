import { describe, expect, it } from 'vitest';
import { buildDocumentText, findEmptyPages, joinTextItems } from './pdfText';

describe('joinTextItems', () => {
  it('joins items and keeps reported line breaks', () => {
    const items = [
      { str: 'Umowa', hasEOL: false },
      { str: ' nr 14/2026', hasEOL: true },
      { str: 'Strony:   ', hasEOL: false },
      { str: 'A i B', hasEOL: false },
    ];
    expect(joinTextItems(items)).toBe('Umowa nr 14/2026\nStrony: A i B');
  });

  it('collapses repeated blank lines and returns "" for no text', () => {
    expect(
      joinTextItems([
        { str: 'a', hasEOL: true },
        { str: '', hasEOL: true },
        { str: '', hasEOL: true },
        { str: 'b', hasEOL: false },
      ]),
    ).toBe('a\n\nb');
    expect(joinTextItems([{ str: '  ', hasEOL: true }])).toBe('');
  });
});

describe('findEmptyPages', () => {
  it('returns 1-based numbers of pages without text', () => {
    expect(findEmptyPages(['a', '', ' ', 'b'])).toEqual([2, 3]);
    expect(findEmptyPages(['a'])).toEqual([]);
  });
});

describe('buildDocumentText', () => {
  it('adds page markers and skips empty pages', () => {
    expect(buildDocumentText(['Tekst 1', '', 'Tekst 3'])).toBe(
      '--- Strona 1 ---\nTekst 1\n\n--- Strona 3 ---\nTekst 3',
    );
  });
});
