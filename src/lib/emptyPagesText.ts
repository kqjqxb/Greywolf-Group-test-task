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
