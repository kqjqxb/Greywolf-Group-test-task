import { describe, expect, it } from 'vitest';
import { emptyPagesText, ocrLimitText, ocrPagesText } from './emptyPagesText';

/** The warning as one sentence, the way the user reads it. */
function fullText(pages: number[]): string | null {
  const text = emptyPagesText(pages);
  return text ? `${text.lead} ${text.detail}` : null;
}

describe('emptyPagesText', () => {
  it('uses the singular for one page', () => {
    expect(fullText([11])).toBe(
      'Strona 11 nie zawiera tekstu (prawdopodobnie to skan). Jej treść nie została przeanalizowana, więc wynik może być niepełny.',
    );
  });

  it('uses the plural for several pages', () => {
    expect(fullText([3, 7])).toBe(
      'Strony 3, 7 nie zawierają tekstu (prawdopodobnie to skany). Ich treść nie została przeanalizowana, więc wynik może być niepełny.',
    );
  });

  it('returns null when every page has text', () => {
    expect(emptyPagesText([])).toBeNull();
  });
});

describe('ocrPagesText', () => {
  function ocrFullText(pages: number[]): string | null {
    const text = ocrPagesText(pages);
    return text ? `${text.lead} ${text.detail}` : null;
  }

  it('uses the singular for one page', () => {
    expect(ocrFullText([11])).toBe(
      'Strona 11 była skanem — tekst rozpoznano automatycznie (OCR), może zawierać błędy.',
    );
  });

  it('uses the plural for several pages', () => {
    expect(ocrFullText([3, 7])).toBe(
      'Strony 3, 7 były skanami — tekst rozpoznano automatycznie (OCR), może zawierać błędy.',
    );
  });

  it('returns null when no page was read with OCR', () => {
    expect(ocrPagesText([])).toBeNull();
  });
});

describe('ocrLimitText', () => {
  it('names the page limit', () => {
    expect(ocrLimitText(5)).toBe(
      'Automatyczne rozpoznawanie tekstu (OCR) obejmuje maksymalnie 5 stron.',
    );
  });
});
