import { MAX_REQUEST_BODY_BYTES } from '../../../src/lib/limits';
import { AnalyzeRequestSchema } from '../../../src/lib/schema';
import { errorResponse, isJsonContentType, readTextWithLimit } from '../http';

/**
 * `POST /analyze` — Stage 1 stub: validates the request, but does not call the LLM yet.
 * The origin is already checked by the router.
 */
export async function handleAnalyze(request: Request): Promise<Response> {
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return errorResponse('unsupported_media_type', 415);
  }

  const rawBody = await readTextWithLimit(request, MAX_REQUEST_BODY_BYTES);
  if (rawBody === null) {
    return errorResponse('payload_too_large', 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('invalid_json', 400);
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('invalid_body', 400);
  }

  // TODO(Stage 2): send parsed.data.text to the LLM and return the validated result.
  return errorResponse('not_implemented', 501);
}
