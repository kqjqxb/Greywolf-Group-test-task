import { describe, expect, it } from 'vitest';
import { deriveJsonFileName, toPrettyJson } from './download';

describe('deriveJsonFileName', () => {
  it('replaces the .pdf extension (any case)', () => {
    expect(deriveJsonFileName('umowa.pdf')).toBe('umowa.analysis.json');
    expect(deriveJsonFileName('Faktura 12.PDF')).toBe('Faktura 12.analysis.json');
  });

  it('keeps Polish characters and other dots', () => {
    expect(deriveJsonFileName('umowa.v2.źródło.pdf')).toBe('umowa.v2.źródło.analysis.json');
  });

  it('replaces characters not allowed in file names', () => {
    expect(deriveJsonFileName('a/b:c*?.pdf')).toBe('a_b_c__.analysis.json');
  });

  it('falls back to a default name', () => {
    expect(deriveJsonFileName('.pdf')).toBe('dokument.analysis.json');
    expect(deriveJsonFileName('   ')).toBe('dokument.analysis.json');
  });

  it('limits the length of the base name', () => {
    expect(deriveJsonFileName(`${'a'.repeat(300)}.pdf`)).toBe(`${'a'.repeat(100)}.analysis.json`);
  });
});

describe('toPrettyJson', () => {
  it('produces indented JSON that parses back to the same value', () => {
    const value = { a: 1, b: ['x'] };
    const json = toPrettyJson(value);
    expect(json).toContain('\n  "a": 1');
    expect(JSON.parse(json)).toEqual(value);
  });
});
