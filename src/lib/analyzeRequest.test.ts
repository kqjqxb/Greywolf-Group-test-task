import { describe, expect, it } from 'vitest';
import { buildAnalyzeRequest } from './analyzeRequest';
import { AppError } from './errors';
import { MAX_REQUEST_BODY_BYTES } from './limits';
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

  it('rejects text over the request body limit', () => {
    const huge = 'ą'.repeat(MAX_REQUEST_BODY_BYTES / 2 + 1); // 2 bytes per char in UTF-8
    expect(() => buildAnalyzeRequest('a.pdf', [huge])).toThrow(AppError);
  });
});
