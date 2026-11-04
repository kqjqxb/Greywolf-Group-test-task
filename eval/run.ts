import { AnalyzeResponseSchema, ApiErrorSchema, type AnalyzeRequest } from '../src/lib/schema';
import { CHECKS } from './expectations';
import { extractPdf } from './extract';

/**
 * Eval CLI: `npm run eval -- <path-to-pdf> [--url <worker-url>] [--origin <origin>]`
 * Extracts the PDF text like the frontend, calls POST /analyze, prints a pass/fail table,
 * the score, model, latency and Claude cost, and exits with 1 when a check fails.
 * Every run that misses the cache spends real API quota.
 */

const DEFAULT_URL = 'http://localhost:8787';
/** Origins the worker allows: local dev (worker/.dev.vars) and production (wrangler.toml). */
const LOCAL_ORIGIN = 'http://localhost:5173';
const PROD_ORIGIN = 'https://kqjqxb.github.io';
/** Claude Haiku 5.5 prices in USD per million tokens (prompts up to 100k tokens). */
const HAIKU_INPUT_USD_PER_MTOK = 0.1;
const HAIKU_OUTPUT_USD_PER_MTOK = 0.5;

interface Options {
  pdfPath: string;
  url: string;
  origin: string;
}

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function parseArgs(args: readonly string[]): Options | null {
  let pdfPath: string | undefined;
  let url = DEFAULT_URL;
  let origin: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--url' || arg === '--origin') {
      const value = args[index + 1];
      if (value === undefined) {
        return null;
      }
      if (arg === '--url') {
        url = value.replace(/\/+$/, '');
      } else {
        origin = value;
      }
      index += 1;
    } else if (arg !== undefined && pdfPath === undefined) {
      pdfPath = arg;
    } else {
      return null;
    }
  }
  if (pdfPath === undefined) {
    return null;
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
  return { pdfPath, url, origin: origin ?? (isLocal ? LOCAL_ORIGIN : PROD_ORIGIN) };
}

/** Parses the worker's "calls=2; input_tokens=…; output_tokens=…" header. */
function parseUsage(header: string | null) {
  if (header === null) {
    return null;
  }
  const values = new Map(
    header.split(';').map((part) => {
      const [key = '', value = ''] = part.trim().split('=');
      return [key, Number(value)] as const;
    }),
  );
  const inputTokens = values.get('input_tokens') ?? 0;
  const outputTokens = values.get('output_tokens') ?? 0;
  const costUsd =
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK + outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000;
  return { calls: values.get('calls') ?? 0, inputTokens, outputTokens, costUsd };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    print('Usage: npm run eval -- <path-to-pdf> [--url <worker-url>] [--origin <origin>]');
    return 2;
  }

  const extracted = await extractPdf(options.pdfPath);
  const fileName = options.pdfPath.split('/').pop() ?? 'document.pdf';
  const body: AnalyzeRequest = { fileName, pages: extracted.pages, text: extracted.text };
  print(`PDF: ${fileName} · ${extracted.pages} pages · ${extracted.text.length} characters`);
  print(`Worker: ${options.url} (Origin: ${options.origin})`);

  const startedAt = performance.now();
  const response = await fetch(`${options.url}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: options.origin },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const json: unknown = await response.json();

  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(json);
    print(`HTTP ${response.status}: ${error.success ? error.data.error : 'unexpected body'}`);
    return 1;
  }
  const parsed = AnalyzeResponseSchema.safeParse(json);
  if (!parsed.success) {
    print('The response does not match AnalyzeResponseSchema.');
    return 1;
  }

  const { result, meta } = parsed.data;
  const context = { result, pageTexts: extracted.pageTexts };
  let passed = 0;
  let applicable = 0;
  print();
  for (const check of CHECKS) {
    const outcome = check.run(context);
    if (outcome !== null) {
      applicable += 1;
      passed += outcome ? 1 : 0;
    }
    const label = outcome === null ? 'SKIP' : outcome ? 'PASS' : 'FAIL';
    print(`${label}  ${check.name}`);
  }

  print();
  print(`Score: ${passed}/${applicable} (${Math.round((passed / applicable) * 100)}%)`);
  print(
    `Model: ${meta?.model ?? '?'} · prompt ${meta?.promptVersion ?? '?'} · cached: ${String(meta?.cached ?? false)} · chunks: ${meta?.chunks ?? '?'}`,
  );
  print(`Latency: ${latencyMs} ms (worker AI time ${meta?.durationMs ?? '?'} ms)`);
  const usage = parseUsage(response.headers.get('X-Claude-Usage'));
  print(
    usage === null
      ? 'Claude usage: none (cache hit or Gemini)'
      : `Claude usage: ${usage.calls} call(s), ${usage.inputTokens} input + ${usage.outputTokens} output tokens ≈ $${usage.costUsd.toFixed(5)}`,
  );
  return passed === applicable ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    print(`Eval failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
