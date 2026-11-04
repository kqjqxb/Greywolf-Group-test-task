/** Polish text of the "pages without text" warning, split into the bold lead and the rest. */
export interface EmptyPagesText {
  lead: string;
  detail: string;
}

/**
 * Singular and plural must agree in every word:
 * - "Strona 11 nie zawiera tekstu (prawdopodobnie to skan). Jej treść …"
 * - "Strony 3, 7 nie zawierają tekstu (prawdopodobnie to skany). Ich treść …"
 * Returns null when there is nothing to warn about.
 */
export function emptyPagesText(pages: readonly number[]): EmptyPagesText | null {
  if (pages.length === 0) {
    return null;
  }
  const list = pages.join(', ');
  const consequence = 'treść nie została przeanalizowana, więc wynik może być niepełny.';
  if (pages.length === 1) {
    return {
      lead: `Strona ${list} nie zawiera tekstu`,
      detail: `(prawdopodobnie to skan). Jej ${consequence}`,
    };
  }
  return {
    lead: `Strony ${list} nie zawierają tekstu`,
    detail: `(prawdopodobnie to skany). Ich ${consequence}`,
  };
}

/**
 * Polish text of the "pages read with OCR" notice, singular and plural:
 * - "Strona 11 była skanem — tekst rozpoznano automatycznie (OCR), może zawierać błędy."
 * - "Strony 3, 7 były skanami — tekst rozpoznano automatycznie (OCR), może zawierać błędy."
 * Returns null when no page was read with OCR.
 */
export function ocrPagesText(pages: readonly number[]): EmptyPagesText | null {
  if (pages.length === 0) {
    return null;
  }
  const list = pages.join(', ');
  const detail = '— tekst rozpoznano automatycznie (OCR), może zawierać błędy.';
  if (pages.length === 1) {
    return { lead: `Strona ${list} była skanem`, detail };
  }
  return { lead: `Strony ${list} były skanami`, detail };
}

/** Added to the empty pages warning when some scanned pages were over the OCR limit. */
export function ocrLimitText(maxPages: number): string {
  return `Automatyczne rozpoznawanie tekstu (OCR) obejmuje maksymalnie ${maxPages} stron.`;
}
