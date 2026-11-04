import { describe, expect, it } from 'vitest';
import { sampleResult } from './fixtures/sample-result';
import { sampleResultLong } from './fixtures/sample-result-long';
import { AnalysisResultSchema, AnalyzeRequestSchema, type AnalysisResult } from './schema';

/** Deep copy of the valid fixture, so each test can break one thing. */
function copySample(): AnalysisResult {
  return structuredClone(sampleResult);
}

function isValid(value: unknown): boolean {
  return AnalysisResultSchema.safeParse(value).success;
}

describe('AnalysisResultSchema', () => {
  it('accepts the sample fixture', () => {
    expect(isValid(sampleResult)).toBe(true);
  });

  it('accepts the long dev fixture', () => {
    expect(isValid(sampleResultLong)).toBe(true);
  });

  it('accepts null title/date and empty arrays (missing information)', () => {
    const result = copySample();
    result.document.title = null;
    result.document.date = null;
    result.entities = { organizations: [], people: [] };
    result.amounts = [];
    result.dates = [];
    result.keywords = [];
    expect(isValid(result)).toBe(true);
  });

  it('rejects a missing field', () => {
    const withoutSummary: Partial<AnalysisResult> = copySample();
    delete withoutSummary.summary;
    expect(isValid(withoutSummary)).toBe(false);

    const withoutLanguage = copySample();
    const document: Partial<AnalysisResult['document']> = withoutLanguage.document;
    delete document.language;
    expect(isValid(withoutLanguage)).toBe(false);
  });

  it('rejects a non-ISO date', () => {
    const inDocument = copySample();
    expect(
      isValid({ ...inDocument, document: { ...inDocument.document, date: '12.03.2026' } }),
    ).toBe(false);

    const inDates = copySample();
    expect(isValid({ ...inDates, dates: [{ date: '12.03.2026', context: 'zawarcie' }] })).toBe(
      false,
    );
    expect(isValid({ ...inDates, dates: [{ date: '2026-02-30', context: 'zawarcie' }] })).toBe(
      false,
    );
  });

  it('rejects a currency that is not an uppercase 3-letter ISO 4217 code', () => {
    for (const currency of ['pln', 'zł', 'PLNX', 'PL']) {
      const result = copySample();
      expect(isValid({ ...result, amounts: [{ value: 1, currency, context: 'x' }] })).toBe(false);
    }
  });

  it('rejects a document type outside the enum', () => {
    const result = copySample();
    expect(isValid({ ...result, document: { ...result.document, type: 'contract' } })).toBe(false);
  });

  it('rejects 2 and 8 key points, accepts 3 and 7', () => {
    const result = copySample();
    const points = (n: number): string[] => Array.from({ length: n }, (_, i) => `Punkt ${i + 1}`);
    expect(isValid({ ...result, keyPoints: points(2) })).toBe(false);
    expect(isValid({ ...result, keyPoints: points(8) })).toBe(false);
    expect(isValid({ ...result, keyPoints: points(3) })).toBe(true);
    expect(isValid({ ...result, keyPoints: points(7) })).toBe(true);
  });

  it('rejects a language that is not ISO 639-1', () => {
    for (const language of ['pol', 'PL', 'polski']) {
      const result = copySample();
      expect(isValid({ ...result, document: { ...result.document, language } })).toBe(false);
    }
  });

  it('rejects an amount given as a string', () => {
    const result = copySample();
    expect(
      isValid({ ...result, amounts: [{ value: '184 500,00', currency: 'PLN', context: 'x' }] }),
    ).toBe(false);
  });
});

describe('AnalyzeRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(
      AnalyzeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 2, text: 'abc' }).success,
    ).toBe(true);
  });

  it('rejects empty text, empty file name and non-positive pages', () => {
    expect(AnalyzeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 2, text: '' }).success).toBe(
      false,
    );
    expect(AnalyzeRequestSchema.safeParse({ fileName: '', pages: 2, text: 'a' }).success).toBe(
      false,
    );
    expect(AnalyzeRequestSchema.safeParse({ fileName: 'a.pdf', pages: 0, text: 'a' }).success).toBe(
      false,
    );
  });
});
