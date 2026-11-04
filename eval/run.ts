import { AnalyzeResponseSchema, ApiErrorSchema, type AnalyzeRequest } from '../src/lib/schema';
import { isSuiteName, SUITES, type SuiteName } from './expectations';
import { extractPdf, type ExtractedDocument } from './extract';
import { loadTextFixture } from './fixture';

/**
 * Eval CLI: `npm run eval -- <path-to-pdf-or-txt> [--suite <name>] [--url <worker-url>] [--origin <origin>]`
 * Extracts the PDF text like the frontend (or reads a .txt fixture, see fixture.ts), calls
 * POST /analyze, checks the result against an expectation suite, prints a pass/fail table,
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

const USAGE =
  'Usage: npm run eval -- <path-to-pdf-or-txt> [--suite <name>] [--url <worker-url>] [--origin <origin>]';
/** A PDF without --suite is the Polish test contract (docs/BRIEF.md). */
const DEFAULT_PDF_SUITE: SuiteName = 'pl-contract';

interface Options {
  path: string;
  suite: string | null;
  url: string;
  origin: string;
}

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
}

function parseArgs(args: readonly string[]): Options | null {
  let path: string | undefined;
  let suite: string | null = null;
  let url = DEFAULT_URL;
  let origin: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--url' || arg === '--origin' || arg === '--suite') {
      const value = args[index + 1];
      if (value === undefined) {
        return null;
      }
      if (arg === '--url') {
        url = value.replace(/\/+$/, '');
      } else if (arg === '--origin') {
        origin = value;
      } else {
        suite = value;
      }
      index += 1;
    } else if (arg !== undefined && path === undefined) {
      path = arg;
    } else {
      return null;
    }
  }
  if (path === undefined) {
    return null;
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
  return { path, suite, url, origin: origin ?? (isLocal ? LOCAL_ORIGIN : PROD_ORIGIN) };
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

/** A .txt fixture brings its own file name, page split and suite; a PDF is extracted like the app. */
async function loadInput(
  options: Options,
): Promise<{ extracted: ExtractedDocument; fileName: string; suite: string }> {
  if (options.path.endsWith('.txt')) {
    const fixture = await loadTextFixture(options.path);
    return {
      extracted: fixture,
      fileName: fixture.fileName,
      suite: options.suite ?? fixture.suite ?? DEFAULT_PDF_SUITE,
    };
  }
  return {
    extracted: await extractPdf(options.path),
    fileName: options.path.split('/').pop() ?? 'document.pdf',
    suite: options.suite ?? DEFAULT_PDF_SUITE,
  };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    print(USAGE);
    return 2;
  }

  const input = await loadInput(options);
  if (!isSuiteName(input.suite)) {
    print(`Unknown expectation suite "${input.suite}". Known: ${Object.keys(SUITES).join(', ')}.`);
    return 2;
  }
  const checks = SUITES[input.suite];
  const { extracted, fileName } = input;
  const body: AnalyzeRequest = { fileName, pages: extracted.pages, text: extracted.text };
  print(
    `Document: ${fileName} · ${extracted.pages} pages · ${extracted.text.length} characters · suite ${input.suite}`,
  );
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
  for (const check of checks) {
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
