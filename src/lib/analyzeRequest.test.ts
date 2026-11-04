import { describe, expect, it } from 'vitest';
import { buildAnalyzeRequest } from './analyzeRequest';
import { AppError } from './errors';
import { MAX_DOCUMENT_CHARS, MAX_REQUEST_BODY_BYTES } from './limits';
import { AnalyzeRequestSchema } from './schema';

describe('buildAnalyzeRequest', () => {
  it('builds a body that matches the contract', () => {
    const request = buildAnalyzeRequest('umowa.pdf', ['Strona pierwsza', '']);
    expect(AnalyzeRequestSchema.parse(request)).toEqual({
      fileName: 'umowa.pdf',
      pages: 2,
      text: '--- Strona 1 ---\nStrona pierwsza',
    });
  });

  it('truncates very long file names to the contract limit', () => {
    const request = buildAnalyzeRequest(`${'a'.repeat(300)}.pdf`, ['x']);
    expect(request.fileName).toHaveLength(255);
  });

  it('rejects text over the character limit', () => {
    const page = 'a'.repeat(MAX_DOCUMENT_CHARS / 2);
    expect(() => buildAnalyzeRequest('a.pdf', [page])).not.toThrow();
    expect(() => buildAnalyzeRequest('a.pdf', [page, page])).toThrow(AppError);
  });

  it('rejects a body over the byte limit even within the character limit', () => {
    // A control character is escaped as "\u0001" in JSON: 6 bytes for 1 character.
    const escaped = '\u0001'.repeat(Math.ceil(MAX_REQUEST_BODY_BYTES / 6));
    expect(escaped.length).toBeLessThan(MAX_DOCUMENT_CHARS);
    expect(() => buildAnalyzeRequest('a.pdf', [escaped])).toThrow(AppError);
  });
});
