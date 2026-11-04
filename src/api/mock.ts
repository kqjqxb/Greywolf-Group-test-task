import { sampleResult } from '../lib/fixtures/sample-result';
import { sampleResultLong } from '../lib/fixtures/sample-result-long';
import { AnalyzeRequestSchema } from '../lib/schema';

/**
 * DEV-ONLY stand-in for the worker, enabled with VITE_MOCK_API=1 in `npm run dev`
 * (never included in production builds, see client.ts). Returns a real `Response`, so the
 * client's validation runs exactly as with the worker.
 * A file name containing "blad" returns `ai_unavailable`, to try the error state;
 * one containing "cache" is answered as a cached result; one containing "umowa_14" returns the
 * long fixture (many amounts, dates and people) to check the dashboard layout.
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
        const lowerName = fileName.toLowerCase();
        const cached = lowerName.includes('cache');
        const sample = lowerName.includes('umowa_14') ? sampleResultLong : sampleResult;
        resolve(
          json(
            {
              result: { ...sample, document: { ...sample.document, fileName, pages } },
              meta: {
                model: 'mock-model',
                promptVersion: 'mock',
                durationMs: cached ? 3 : MOCK_DELAY_MS,
                cached,
                chunks: 1,
              },
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
