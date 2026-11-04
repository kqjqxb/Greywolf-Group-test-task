import { sampleResult } from '../lib/fixtures/sample-result';
import { AnalyzeRequestSchema } from '../lib/schema';

/**
 * DEV-ONLY stand-in for the worker, enabled with VITE_MOCK_API=1 in `npm run dev`
 * (never included in production builds, see client.ts). Returns a real `Response`, so the
 * client's validation runs exactly as with the worker.
 * A file name containing "blad" returns `ai_unavailable`, to try the error state.
 */
const MOCK_DELAY_MS = 1500;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function mockFetch(body: string, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const request = AnalyzeRequestSchema.safeParse(JSON.parse(body));
      if (!request.success) {
        resolve(json({ error: 'invalid_body' }, 400));
      } else if (request.data.fileName.toLowerCase().includes('blad')) {
        resolve(json({ error: 'ai_unavailable' }, 503));
      } else {
        const { fileName, pages } = request.data;
        resolve(
          json(
            {
              result: { ...sampleResult, document: { ...sampleResult.document, fileName, pages } },
            },
            200,
          ),
        );
      }
    }, MOCK_DELAY_MS);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
