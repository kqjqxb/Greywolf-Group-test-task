/** Maximum accepted PDF size (F-01): 10 MB. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Longest document text that can be analyzed: 300k characters (~85 pages of dense text; the
 * 12-page test PDF has ~35k). The worker analyzes it in at most 3 chunks (worker/src/ai/chunking.ts
 * MAX_CHUNKS), which caps the AI calls — and the cost — of one request.
 */
export const MAX_DOCUMENT_CHARS = 300_000;

/**
 * Maximum accepted body of `POST /analyze` (extracted text + metadata): 1 MB. 300k characters
 * take at most ~900 KB in UTF-8 (3 bytes per character for CJK scripts, 1–2 for Polish), so any
 * document within MAX_DOCUMENT_CHARS fits; a bigger body cannot be a valid request.
 */
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
