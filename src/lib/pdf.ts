import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { AppError } from './errors';
import { findEmptyPages, joinTextItems } from './pdfText';

export interface ExtractedPdf {
  /** Text of each page; index 0 is page 1. */
  pageTexts: string[];
  /** 1-based numbers of pages without a text layer (e.g. scanned pages). */
  emptyPages: number[];
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return 'str' in item;
}

/**
 * Extracts text page by page with pdf.js (in the browser; the file is not uploaded).
 * pdf.js is loaded on first use to keep the initial bundle small. Its worker URL comes from
 * a Vite `?url` import, so it resolves correctly under the GitHub Pages base path.
 * Throws AppError: `pdf_encrypted`, `pdf_corrupted` or `pdf_no_text`.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<ExtractedPdf> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(joinTextItems(content.items.filter(isTextItem)));
      page.cleanup();
    }

    const emptyPages = findEmptyPages(pageTexts);
    if (emptyPages.length === pageTexts.length) {
      throw new AppError('pdf_no_text');
    }
    return { pageTexts, emptyPages };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof pdfjs.PasswordException) {
      throw new AppError('pdf_encrypted');
    }
    throw new AppError('pdf_corrupted');
  } finally {
    void loadingTask.destroy();
  }
}
