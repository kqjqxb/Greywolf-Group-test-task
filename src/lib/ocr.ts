import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createWorker, OEM, type Worker as OcrWorker } from 'tesseract.js';
// Self-hosted tesseract assets (no CDN, so the strict CSP stays unchanged). Vite copies them to
// dist/assets/ under the base path. Only the SIMD + LSTM core is shipped: SIMD is supported by
// every browser that runs this app, and the "fast" traineddata only needs the LSTM engine.
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';

/**
 * F-10 OCR for pages without a text layer. This module is loaded with `import()` only when such
 * pages exist, so tesseract.js is not part of the initial bundle.
 */

/** Pages are rendered at 2× their PDF size (~144 DPI): sharp enough for OCR, still fast. */
const RENDER_SCALE = 2;

/** Language data ("fast" models, gzipped) is served from public/tessdata/. */
const LANGUAGES = ['pol', 'eng'];

function absoluteUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

/** Draws one PDF page on a new canvas (white background, like on paper). */
async function renderPage(pdf: PDFDocumentProxy, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return canvas;
  } finally {
    page.cleanup();
  }
}

/**
 * Starts a tesseract worker with our self-hosted assets.
 * tesseract.js swallows startup errors (e.g. language data that failed to download), so its
 * promise would never settle and OCR would hang. Its `errorHandler` still receives the error,
 * so we use it to reject. (In that case the half-started worker thread stays until page reload.)
 */
function startWorker(): Promise<OcrWorker> {
  return new Promise((resolve, reject) => {
    createWorker(LANGUAGES, OEM.LSTM_ONLY, {
      workerPath: absoluteUrl(workerUrl),
      corePath: absoluteUrl(coreUrl),
      langPath: absoluteUrl(`${import.meta.env.BASE_URL}tessdata`),
      gzip: true,
      // No IndexedDB copy of the language data: in testing, tesseract's cache write never
      // finished in Chrome and OCR hung. The browser's HTTP cache still avoids most re-downloads.
      cacheMethod: 'none',
      // Load the worker from its own same-origin URL instead of a blob: wrapper. A blob: worker
      // inherits the page CSP, which (on purpose) does not allow compiling WebAssembly.
      workerBlobURL: false,
      errorHandler: reject,
    }).then(resolve, reject);
  });
}

/**
 * Recognises the text of the given pages (1-based) and returns it per page number.
 * `onPage` is called before each page, for the progress UI. A page that fails is left out of
 * the result; a failure to start tesseract (e.g. assets not loaded) rejects the whole call.
 */
export async function recognizePages(
  pdf: PDFDocumentProxy,
  pageNumbers: readonly number[],
  onPage: (pageNumber: number) => void,
): Promise<Map<number, string>> {
  const worker = await startWorker();
  const texts = new Map<number, string>();
  try {
    for (const pageNumber of pageNumbers) {
      onPage(pageNumber);
      try {
        const canvas = await renderPage(pdf, pageNumber);
        const { data } = await worker.recognize(canvas);
        texts.set(pageNumber, data.text);
        // Free the bitmap memory right away (a 2× A4 page is ~8 MB).
        canvas.width = 0;
        canvas.height = 0;
      } catch {
        // Skip this page; it stays empty and is reported like a page without text.
      }
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}
