import type { ApiErrorCode } from '../../src/lib/schema';

/** JSON response helper. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Error response: only a fixed code from the shared contract, never a stack trace or echoed input. */
export function errorResponse(code: ApiErrorCode, status: number): Response {
  return json({ error: code }, status);
}

/** True when the Content-Type is application/json (parameters such as charset are allowed). */
export function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const mediaType = contentType.split(';')[0] ?? '';
  return mediaType.trim().toLowerCase() === 'application/json';
}

/**
 * Reads the body as text, or returns null when it is larger than `maxBytes`.
 * Checks the declared Content-Length first (cheap), then counts the bytes actually read,
 * because Content-Length can be missing (chunked upload) or wrong.
 */
export async function readTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > maxBytes) {
    return null;
  }
  if (request.body === null) {
    return '';
  }

  // workers-types declares the body as ReadableStream<any>; request bodies are always bytes.
  const body = request.body as ReadableStream<Uint8Array>;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
