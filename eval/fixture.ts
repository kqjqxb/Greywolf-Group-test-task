import { readFile } from 'node:fs/promises';
import { buildDocumentText } from '../src/lib/pdfText';
import type { ExtractedDocument } from './extract';

/**
 * Plain-text eval fixtures (eval/fixtures/*.txt), for documents we do not want to keep as PDFs.
 * Format:
 *   # free comment lines
 *   # fileName: Jordan_Ellis_CV.pdf
 *   # pages: 2
 *   # expectations: en-cv
 *   <page 1 text>
 *   === PAGE BREAK ===
 *   <page 2 text>
 * The header ends at the first line that does not start with "#". The text is sent with the same
 * "--- Strona N ---" markers the app adds (src/lib/pdfText.ts).
 */

export interface TextFixture extends ExtractedDocument {
  fileName: string;
  /** Name of the expectation suite (eval/expectations.ts), if the header gives one. */
  suite: string | null;
}

const PAGE_BREAK = '=== PAGE BREAK ===';
const HEADER_FIELD = /^#\s*(\w+):\s*(.+)$/;

export function parseTextFixture(content: string): TextFixture {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const fields = new Map<string, string>();
  let bodyStart = 0;
  while (bodyStart < lines.length && (lines[bodyStart] ?? '').startsWith('#')) {
    const match = HEADER_FIELD.exec(lines[bodyStart] ?? '');
    if (match?.[1] !== undefined && match[2] !== undefined) {
      fields.set(match[1], match[2].trim());
    }
    bodyStart += 1;
  }

  const pageTexts = lines
    .slice(bodyStart)
    .join('\n')
    .split(`\n${PAGE_BREAK}\n`)
    .map((page) => page.trim());
  const fileName = fields.get('fileName');
  const pages = Number(fields.get('pages'));
  if (fileName === undefined) {
    throw new Error('Fixture header has no "# fileName:" line.');
  }
  if (pages !== pageTexts.length) {
    throw new Error(`Fixture header says ${pages} pages, the body has ${pageTexts.length}.`);
  }
  return {
    fileName,
    pages,
    pageTexts,
    text: buildDocumentText(pageTexts),
    suite: fields.get('expectations') ?? null,
  };
}

export async function loadTextFixture(path: string): Promise<TextFixture> {
  return parseTextFixture(await readFile(path, 'utf8'));
}
