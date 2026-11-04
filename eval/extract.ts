import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { buildDocumentText, joinTextItems } from '../src/lib/pdfText';

/**
 * Text extraction for the eval, in Node. Uses the same pure helpers as the frontend
 * (src/lib/pdfText.ts), so the worker receives exactly the text and page markers the app sends.
 * No OCR: pages without a text layer (the scanned annex on page 11) stay empty.
 */

export interface ExtractedDocument {
  pages: number;
  /** Text of each page; index 0 is page 1. */
  pageTexts: string[];
  /** The request text, with "--- Strona N ---" markers. */
  text: string;
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return 'str' in item;
}

export async function extractPdf(path: string): Promise<ExtractedDocument> {
  const data = new Uint8Array(await readFile(path));
  const loadingTask = getDocument({ data });
  try {
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(joinTextItems(content.items.filter(isTextItem)));
      page.cleanup();
    }
    return { pages: pdf.numPages, pageTexts, text: buildDocumentText(pageTexts) };
  } finally {
    await loadingTask.destroy();
  }
}
