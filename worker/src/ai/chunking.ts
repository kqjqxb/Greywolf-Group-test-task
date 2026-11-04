import { MAX_DOCUMENT_CHARS } from '../../../src/lib/limits';
import type { AnalysisResult } from '../../../src/lib/schema';
import { dedupeAmounts, dedupeStrings, mergeDates } from './dedupe';

/**
 * F-08 long documents: split → analyze chunks in parallel → merge deterministically.
 * Documents up to CHUNKING_THRESHOLD_CHARS (the 12-page test PDF has ~35k characters) are
 * analyzed in one call; only longer ones are split.
 */

/** Text longer than this is split into chunks. */
export const CHUNKING_THRESHOLD_CHARS = 150_000;
/** Target maximum size of one chunk: smaller than the threshold, so parallel calls finish sooner. */
export const CHUNK_MAX_CHARS = 100_000;
/**
 * Cost guard: every chunk is a full document call (up to 2 attempts per provider), so the number
 * of chunks multiplies the cost of one request. 3 chunks of 100k characters cover the advertised
 * limit of MAX_DOCUMENT_CHARS (300k); a longer document is rejected before any AI call.
 */
export const MAX_CHUNKS = 3;
/** Limits of the merged lists (keyPoints from the contract, keywords from the prompt). */
export const MAX_KEY_POINTS = 7;
export const MAX_KEYWORDS = 10;

/** The frontend starts every page with this marker line (src/lib/pdfText.ts buildDocumentText). */
const PAGE_MARKER = /^--- Strona \d+ ---$/m;
const BEFORE_PAGE_MARKER = /(?=^--- Strona \d+ ---$)/m;

/** Cuts a block longer than `maxChars` into pieces, preferring to cut at a line break. */
function splitOversized(block: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = block;
  while (rest.length > maxChars) {
    const lineBreak = rest.lastIndexOf('\n', maxChars);
    // No line break in the second half: cut hard instead of producing tiny pieces.
    const cut = lineBreak > maxChars / 2 ? lineBreak : maxChars;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest.trim() !== '') {
    pieces.push(rest);
  }
  return pieces;
}

/**
 * Splits the document into chunks of at most `maxChars`, on page markers: whole pages are packed
 * into a chunk while they fit; a single page longer than `maxChars` is cut into pieces.
 * Text without page markers is treated as one page.
 */
export function splitIntoChunks(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
  const pages = PAGE_MARKER.test(text) ? text.split(BEFORE_PAGE_MARKER) : [text];
  const blocks = pages
    .map((page) => page.trim())
    .filter((page) => page !== '')
    .flatMap((page) => splitOversized(page, maxChars));

  const chunks: string[] = [];
  let current = '';
  for (const block of blocks) {
    const joined = current === '' ? block : `${current}\n\n${block}`;
    if (joined.length <= maxChars) {
      current = joined;
    } else {
      chunks.push(current);
      current = block;
    }
  }
  if (current !== '') {
    chunks.push(current);
  }
  return chunks;
}

/** True when the document must be analyzed in chunks. */
export function needsChunking(text: string): boolean {
  return text.length > CHUNKING_THRESHOLD_CHARS;
}

/**
 * The texts the document will be analyzed as: the whole text, or its chunks when it is long.
 * Used both to analyze and, before any AI call, to check the size and the Claude budget.
 */
export function planChunks(text: string): string[] {
  return needsChunking(text) ? splitIntoChunks(text) : [text];
}

/**
 * True when the document is too long to analyze. Page packing can need one more chunk than
 * `length / CHUNK_MAX_CHARS`, so both the character limit and the chunk count are checked.
 */
export function isTooLong(text: string, chunks: readonly string[]): boolean {
  return text.length > MAX_DOCUMENT_CHARS || chunks.length > MAX_CHUNKS;
}

/** Most frequent value; on a tie the one that appears first. */
function mostFrequent<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Takes the 1st item of every list, then the 2nd of every list, … so each chunk is represented. */
function roundRobin(lists: readonly (readonly string[])[]): string[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const result: string[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const item = list[index];
      if (item !== undefined) {
        result.push(item);
      }
    }
  }
  return result;
}

/**
 * Merges validated chunk results (in document order) into one result:
 * - document: language and type by majority (tie → earlier chunk), title/date from the first chunk
 *   that has one;
 * - organizations, people, keywords: case-insensitive dedupe (keywords trimmed to MAX_KEYWORDS);
 * - amounts: dedupe by value + currency + context; dates: one entry per date (contexts merged);
 * - keyPoints: round-robin over chunks, deduped, trimmed to MAX_KEY_POINTS.
 * `summary` is the summary of the whole document, written by a separate call from the chunk
 * summaries: a single chunk's summary would describe only part of the document.
 */
export function mergeChunkResults(
  results: readonly AnalysisResult[],
  summary: string,
): AnalysisResult {
  const [first] = results;
  if (first === undefined) {
    throw new Error('mergeChunkResults needs at least one result');
  }
  const documents = results.map((result) => result.document);

  return {
    document: {
      fileName: first.document.fileName,
      pages: first.document.pages,
      language: mostFrequent(documents.map((d) => d.language)) ?? first.document.language,
      type: mostFrequent(documents.map((d) => d.type)) ?? first.document.type,
      title: documents.find((d) => d.title !== null)?.title ?? null,
      date: documents.find((d) => d.date !== null)?.date ?? null,
    },
    summary,
    keyPoints: dedupeStrings(roundRobin(results.map((r) => r.keyPoints))).slice(0, MAX_KEY_POINTS),
    entities: {
      organizations: dedupeStrings(results.flatMap((r) => r.entities.organizations)),
      people: dedupeStrings(results.flatMap((r) => r.entities.people)),
    },
    amounts: dedupeAmounts(results.flatMap((r) => r.amounts)),
    dates: mergeDates(results.flatMap((r) => r.dates)),
    keywords: dedupeStrings(results.flatMap((r) => r.keywords)).slice(0, MAX_KEYWORDS),
  };
}
