import { describe, expect, it } from 'vitest';
import { buildDocumentText, findEmptyPages, joinTextItems } from './pdfText';

/** A pdf.js-like text item at (x, y) with the given width and font size. */
function piece(str: string, x: number, y: number, width: number, fontSize = 10, hasEOL = false) {
  return { str, hasEOL, transform: [fontSize, 0, 0, fontSize, x, y], width, height: fontSize };
}

/** pdf.js line-end marker: an empty item with hasEOL (and zero size). */
function eol(x = 0, y = 0) {
  return { str: '', hasEOL: true, transform: [10, 0, 0, 10, x, y], width: 0, height: 0 };
}

describe('joinTextItems', () => {
  it('joins pieces split before Polish letters into whole words (items from the test PDF)', () => {
    // Page 1 of Test_PDF_Insight_umowa_14-2026.pdf: the Polish letters use a fallback font.
    const items = [
      piece('Dokument poufny — wy', 56.68, 750.42, 89.99, 7.99),
      piece('łą', 146.68, 750.42, 6.74, 7.99),
      piece('cznie do u', 153.43, 750.42, 39.23, 7.99),
      piece('ż', 192.43, 750.42, 4.42, 7.99),
      piece('ytku Stron', 196.93, 750.42, 37.72, 7.99),
    ];
    expect(joinTextItems(items)).toBe('Dokument poufny — wyłącznie do użytku Stron');
  });

  it('keeps a word whole when the next piece slightly overlaps (negative gap)', () => {
    const items = [
      piece('Marka Zieli', 68.77, 497.67, 50.6, 9.6),
      piece('ń', 119.02, 497.67, 5.98, 9.6),
      piece('skiego', 125.02, 497.67, 30.64, 9.6),
    ];
    expect(joinTextItems(items)).toBe('Marka Zielińskiego');
  });

  it('adds a space for a visible gap when pdf.js did not emit one (e.g. table cells)', () => {
    const items = [
      piece('Kierownik projektu', 60, 400, 80),
      piece('roboczogodzina', 200, 400, 70),
      piece('260,00 zł', 330, 400, 40),
    ];
    expect(joinTextItems(items)).toBe('Kierownik projektu roboczogodzina 260,00 zł');
  });

  it('keeps explicit space items without doubling spaces', () => {
    const items = [
      piece('sku w dniu', 130.18, 656.67, 49.93, 9.6),
      { ...piece(' ', 180.11, 656.67, 4.43, 9.6), height: 0 },
      piece('12.03.2026 r.', 183.43, 656.67, 62.46, 9.6),
    ];
    expect(joinTextItems(items)).toBe('sku w dniu 12.03.2026 r.');
  });

  it('starts a new line on hasEOL and when the text moves to another line', () => {
    const items = [
      piece('UMOWA RAMOWA NR 14/2026', 56.68, 702.42, 271.94, 18, true),
      piece('o wdrożenie', 56.68, 680.67, 100, 18),
      // No hasEOL, but 20 pt lower: another line.
      piece('zawarta w Gdańsku', 56.68, 656.67, 90, 9.6),
    ];
    expect(joinTextItems(items)).toBe('UMOWA RAMOWA NR 14/2026\no wdrożenie\nzawarta w Gdańsku');
  });

  it('adds a space when the text jumps back on the same line (next column)', () => {
    const items = [piece('Lewa kolumna', 300, 500, 120), piece('Prawa', 50, 500, 30)];
    expect(joinTextItems(items)).toBe('Lewa kolumna Prawa');
  });

  it('keeps empty lines (paragraphs) at most once and returns "" for no text', () => {
    const items = [piece('a', 0, 100, 5, 10, true), eol(), eol(), eol(), piece('b', 0, 50, 5)];
    expect(joinTextItems(items)).toBe('a\n\nb');
    expect(joinTextItems([{ ...piece('  ', 0, 0, 5), hasEOL: true }])).toBe('');
    expect(joinTextItems([])).toBe('');
  });

  it('trims and collapses whitespace inside lines', () => {
    const items = [piece('Strony:   ', 0, 100, 40), piece('A i B', 40, 100, 20)];
    expect(joinTextItems(items)).toBe('Strony: A i B');
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
