/**
 * Pure helpers for turning pdf.js text items into plain text.
 * Kept separate from pdf.ts so they can be tested without loading pdf.js.
 */

/** The part of a pdf.js TextItem we use. */
export interface TextPiece {
  str: string;
  hasEOL: boolean;
}

/** Joins the text items of one page, keeping the line breaks pdf.js reports. */
export function joinTextItems(items: readonly TextPiece[]): string {
  const text = items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join('');
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
