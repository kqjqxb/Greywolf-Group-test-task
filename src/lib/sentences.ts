/**
 * Sentence counting tolerant of Polish abbreviations and decimal numbers.
 * Used by the worker to enforce "summary = 3–5 sentences"; pure, so the frontend can reuse it.
 *
 * Rule: a sentence ends at `.`, `!`, `?` or `…` followed by whitespace and an uppercase letter
 * (optionally after an opening quote), or at the end of the text.
 *
 * Scripts without letter case (Arabic, Hebrew, Devanagari, …) cannot use the uppercase signal, so
 * there a terminator followed by whitespace and a caseless letter (`\p{Lo}`) is a boundary; the
 * Arabic question mark `؟`, Urdu full stop `۔` and Devanagari danda `।` `॥` count as terminators.
 * Chinese and Japanese write no spaces between sentences, so the full-width `。` `！` `？` (and the
 * half-width `｡`) end a sentence before any following character. Thai marks sentence ends only with
 * a space, which is indistinguishable from a phrase break, so Thai is not split.
 *  - An opening bracket after a dot does not start a sentence: "sp. z o.o. (Zamawiający)" and
 *    "S.A. (Wykonawca)" are role labels inside a sentence, which is how models describe parties.
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

/**
 * Candidate boundary, two alternatives:
 * 1. terminal punctuation, optional closing quotes/brackets, whitespace, then an uppercase or
 *    caseless letter (optionally after an opening quote);
 * 2. CJK full-width terminator, optional closing brackets/quotes, then any non-space character
 *    (whitespace in between is optional).
 * The end of the text is not a boundary: the last sentence is counted without one.
 */
const BOUNDARY =
  /([.!?…؟۔।॥]+)["'”»)\]」』）]*\s+(?=["'„«“「『（]*[\p{Lu}\p{Lo}])|([。！？｡]+)["'”»)\]」』）]*\s*(?=\S)/gu;

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
    const punctuation = match[1] ?? match[2] ?? '';
    const textBefore = trimmed.slice(0, match.index);
    if (punctuation === '.' && endsWithNonTerminalDot(textBefore)) {
      continue;
    }
    count += 1;
  }
  return count;
}
