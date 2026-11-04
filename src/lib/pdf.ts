import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { AppError } from './errors';
import { findEmptyPages, joinTextItems, normaliseText, planOcr } from './pdfText';

export interface ExtractedPdf {
  /** Text of each page; index 0 is page 1. Pages read with OCR contain the recognised text. */
  pageTexts: string[];
  /** 1-based numbers of pages that still have no text (OCR failed, found nothing or was skipped). */
  emptyPages: number[];
  /** 1-based numbers of pages whose text comes from OCR (may contain recognition errors). */
  ocrPages: number[];
  /** True when some empty pages were not OCR'd because of MAX_OCR_PAGES. */
  ocrLimitReached: boolean;
}

export interface ExtractOptions {
  /** Called before OCR of each page (1-based), for the progress UI. */
  onOcrPage?: (pageNumber: number) => void;
}

/**
 * Safety net, not a performance budget: tesseract.js can hang without reporting an error
 * (seen with its IndexedDB cache). After this time the analysis continues without OCR.
 */
const OCR_TIMEOUT_MS = 30_000;

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return 'str' in item;
}

/**
 * Runs OCR on empty pages (up to MAX_OCR_PAGES) and writes the text into `pageTexts`.
 * Best effort: if tesseract cannot start, the pages simply stay empty (the old behaviour).
 * Returns the pages that got text from OCR.
 */
async function fillEmptyPagesWithOcr(
  pdf: PDFDocumentProxy,
  pageTexts: string[],
  pagesToOcr: number[],
  onOcrPage: (pageNumber: number) => void,
): Promise<number[]> {
  if (pagesToOcr.length === 0) {
    return [];
  }
  performance.mark('pdf-insight:ocr-start');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('OCR timeout'));
    }, OCR_TIMEOUT_MS);
  });
  try {
    // Loaded only now, so documents with a text layer never download tesseract.
    const { recognizePages } = await import('./ocr');
    const texts = await Promise.race([
      recognizePages(pdf, pagesToOcr, (page) => {
        // After a timeout the analysis has moved on; stop updating the progress label.
        if (!timedOut) {
          onOcrPage(page);
        }
      }),
      timeout,
    ]);
    const ocrPages: number[] = [];
    for (const [pageNumber, rawText] of texts) {
      const text = normaliseText(rawText);
      if (text !== '') {
        pageTexts[pageNumber - 1] = text;
        ocrPages.push(pageNumber);
      }
    }
    return ocrPages.sort((a, b) => a - b);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    // Visible in the DevTools Performance panel (used to check the 30 s budget).
    performance.measure('pdf-insight:ocr', 'pdf-insight:ocr-start');
  }
}

/**
 * Extracts text page by page with pdf.js (in the browser; the file is not uploaded), then OCRs
 * pages without a text layer (F-10).
 * pdf.js is loaded on first use to keep the initial bundle small. Its worker URL comes from
 * a Vite `?url` import, so it resolves correctly under the GitHub Pages base path.
 * Throws AppError: `pdf_encrypted`, `pdf_corrupted` or `pdf_no_text`.
 */
export async function extractPdfText(
  data: ArrayBuffer,
  options: ExtractOptions = {},
): Promise<ExtractedPdf> {
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

    const plan = planOcr(findEmptyPages(pageTexts));
    const ocrPages = await fillEmptyPagesWithOcr(
      pdf,
      pageTexts,
      plan.ocr,
      options.onOcrPage ?? (() => undefined),
    );

    const emptyPages = findEmptyPages(pageTexts);
    if (emptyPages.length === pageTexts.length) {
      throw new AppError('pdf_no_text');
    }
    return { pageTexts, emptyPages, ocrPages, ocrLimitReached: plan.skipped.length > 0 };
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
