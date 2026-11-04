/**
 * Pure helpers for turning pdf.js text items into plain text.
 * Kept separate from pdf.ts so they can be tested without loading pdf.js.
 */

/**
 * The part of a pdf.js TextItem we use. `transform` is the PDF text matrix
 * [scaleX, skewY, skewX, scaleY, x, y]: x/y is where the item starts (y grows upwards),
 * and the length of (skewX, scaleY) is the font size. `width` is in the same units as x.
 */
export interface TextPiece {
  str: string;
  hasEOL: boolean;
  transform: readonly number[];
  width: number;
  height: number;
}

/**
 * Thresholds as a fraction of the font size. A space in typical fonts is ~0.25 em wide, while
 * pieces of one word (e.g. a Polish letter drawn with a fallback font: "wy" + "łą" + "cznie")
 * touch each other (gap ≈ 0). A gap above 0.15 em is therefore treated as a space.
 */
const SPACE_GAP_EM = 0.15;
/** A vertical move of more than half a line means the next piece is on another line. */
const NEW_LINE_EM = 0.5;

interface Geometry {
  x: number;
  y: number;
  end: number;
  fontSize: number;
}

function geometryOf(item: TextPiece): Geometry {
  const [, , skewX = 0, scaleY = 0, x = 0, y = 0] = item.transform;
  // Empty or whitespace items can have height 0; the matrix still carries the font size.
  const fontSize = Math.hypot(skewX, scaleY) || item.height || 1;
  return { x, y, end: x + item.width, fontSize };
}

/**
 * What to put between two neighbouring pieces on the page, based on their position:
 * "\n" when the next one is on another line, " " when there is a visible gap
 * (or the text jumps back, e.g. to another column), "" when they touch.
 */
function separatorBetween(previous: Geometry, next: Geometry): '' | ' ' | '\n' {
  const fontSize = Math.max(previous.fontSize, next.fontSize);
  if (Math.abs(next.y - previous.y) > fontSize * NEW_LINE_EM) {
    return '\n';
  }
  const gap = next.x - previous.end;
  if (gap > fontSize * SPACE_GAP_EM || gap < -fontSize) {
    return ' ';
  }
  return '';
}

/**
 * Joins the text items of one page. pdf.js splits text into pieces whenever the font changes
 * (in some PDFs before every Polish letter), so pieces are not blindly joined: line breaks reported
 * by pdf.js (`hasEOL`) are kept, and between other pieces the gap on the page decides between
 * nothing, a space and a new line.
 */
export function joinTextItems(items: readonly TextPiece[]): string {
  let text = '';
  let previous: Geometry | null = null;
  // Line ends reported by pdf.js since the last piece; two or more mean an empty line (paragraph).
  let pendingLineBreaks = 0;

  for (const item of items) {
    if (item.str !== '') {
      const current = geometryOf(item);
      if (pendingLineBreaks > 0) {
        text += '\n'.repeat(pendingLineBreaks);
      } else if (previous !== null) {
        text += separatorBetween(previous, current);
      }
      text += item.str;
      previous = current;
      pendingLineBreaks = 0;
    }
    if (item.hasEOL) {
      pendingLineBreaks += 1;
    }
  }

  return normaliseText(text);
}

/** 1-based numbers of pages that have no text layer. */
export function findEmptyPages(pageTexts: readonly string[]): number[] {
  return pageTexts.flatMap((text, index) => (text.trim() === '' ? [index + 1] : []));
}

/**
 * Builds the text sent to the API. Each non-empty page gets a marker so the model can
 * refer to pages; the worker wraps the whole text in delimiters as untrusted data.
 */
export function buildDocumentText(pageTexts: readonly string[]): string {
  return pageTexts
    .flatMap((text, index) => (text.trim() === '' ? [] : [`--- Strona ${index + 1} ---\n${text}`]))
    .join('\n\n');
}

/** At most this many pages are sent to OCR: each page takes a few seconds in the browser. */
export const MAX_OCR_PAGES = 5;

/** Which empty pages to OCR (the first MAX_OCR_PAGES) and which to skip because of the limit. */
export function planOcr(emptyPages: readonly number[]): { ocr: number[]; skipped: number[] } {
  return {
    ocr: emptyPages.slice(0, MAX_OCR_PAGES),
    skipped: emptyPages.slice(MAX_OCR_PAGES),
  };
}

/**
 * Single spaces, trimmed lines, at most one empty line in a row. Used for pdf.js text and for
 * OCR output, so both look the same to the model.
 */
export function normaliseText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
