import { AppError } from './errors';
import { MAX_DOCUMENT_CHARS, MAX_REQUEST_BODY_BYTES } from './limits';
import { buildDocumentText } from './pdfText';
import type { AnalyzeRequest } from './schema';

/** Contract limit for `fileName` in AnalyzeRequestSchema. */
const MAX_FILE_NAME_LENGTH = 255;

/**
 * Builds the `POST /analyze` body from extracted pages.
 * Throws AppError('text_too_large') when the text or the body would exceed the worker's limits,
 * so the user gets a clear message without a request.
 */
export function buildAnalyzeRequest(
  fileName: string,
  pageTexts: readonly string[],
): AnalyzeRequest {
  const request: AnalyzeRequest = {
    fileName: fileName.slice(0, MAX_FILE_NAME_LENGTH) || 'dokument.pdf',
    pages: pageTexts.length,
    text: buildDocumentText(pageTexts),
  };
  const bodyBytes = new TextEncoder().encode(JSON.stringify(request)).length;
  if (request.text.length > MAX_DOCUMENT_CHARS || bodyBytes > MAX_REQUEST_BODY_BYTES) {
    throw new AppError('text_too_large');
  }
  return request;
}
