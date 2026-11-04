/**
 * Sentence counting tolerant of Polish abbreviations and decimal numbers.
 * Used by the worker to enforce "summary = 3–5 sentences"; pure, so the frontend can reuse it.
 *
 * Rule: a sentence ends at `.`, `!`, `?` or `…` followed by whitespace and an uppercase letter
 * (optionally after an opening quote/bracket), or at the end of the text.
 *  - Decimals ("184.500,00", "3.5") never split, because no whitespace follows the dot.
 *  - Suffix abbreviations ("2026 r. w", "sp. z o.o. oraz", "100 zł.") are usually followed by
 *    a lowercase word, so they do not split; when followed by an uppercase word they are treated
 *    as the real end of a sentence (e.g. "… Kwadrat Software S.A. Umowa …").
 *  - Prefix abbreviations ("ul. Portowa", "prof. Nowak", "tj. Kowalski") and initials ("J. Nowak")
 *    are normally followed by an uppercase name, so a dot after them never ends a sentence.
 */

/** Abbreviations that stand before a name or number, compared lowercase and without the final dot. */
const PREFIX_ABBREVIATIONS = new Set([
  'al',
  'art',
  'dr',
  'godz',
  'hab',
  'im',
  'inż',
  'lek',
  'm.in',
  'mec',
  'mgr',
  'np',
  'nr',
  'ok',
  'os',
  'pkt',
  'pl',
  'płk',
  'por',
  'poz',
  'prof',
  'red',
  'sp',
  'str',
  'św',
  'tel',
  'tj',
  'tzn',
  'tzw',
  'ul',
  'ust',
  'woj',
  'ww',
  'zał',
  'zob',
  'e.g',
  'i.e',
  'mr',
  'mrs',
  'ms',
  'no',
  'vs',
]);

/** Candidate boundary: terminal punctuation, optional closing quotes/brackets, whitespace, then an uppercase letter. */
const BOUNDARY = /([.!?…]+)["'”»)\]]*\s+(?=["'„«“([]*\p{Lu})/gu;

/** True when the dot at the end of `textBefore` belongs to an abbreviation or an initial. */
function endsWithNonTerminalDot(textBefore: string): boolean {
  const lastToken = textBefore.split(/\s+/).pop() ?? '';
  // Strip leading brackets/quotes, e.g. "(ul" -> "ul".
  const word = lastToken.replace(/^["'„«“([]+/u, '');
  if (/^\p{Lu}$/u.test(word)) {
    return true; // initial, e.g. "J. Nowak"
  }
  return PREFIX_ABBREVIATIONS.has(word.toLowerCase());
}

/** Number of sentences in `text`; 0 for empty or whitespace-only text. */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }

  let count = 1; // the last sentence does not need a following boundary
  for (const match of trimmed.matchAll(BOUNDARY)) {
    const punctuation = match[1] ?? '';
    const textBefore = trimmed.slice(0, match.index);
    if (punctuation === '.' && endsWithNonTerminalDot(textBefore)) {
      continue;
    }
    count += 1;
  }
  return count;
}
