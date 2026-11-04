import { describe, expect, it } from 'vitest';
import { sampleResult } from '../../../src/lib/fixtures/sample-result';
import type { AnalysisResult } from '../../../src/lib/schema';
import { MAX_DOCUMENT_CHARS } from '../../../src/lib/limits';
import {
  CHUNK_MAX_CHARS,
  CHUNKING_THRESHOLD_CHARS,
  isTooLong,
  MAX_CHUNKS,
  MAX_KEY_POINTS,
  mergeChunkResults,
  needsChunking,
  planChunks,
  splitIntoChunks,
} from './chunking';

function pages(count: number, charsPerPage: number): string {
  return Array.from(
    { length: count },
    (_, i) => `--- Strona ${i + 1} ---\n${'x'.repeat(charsPerPage)}`,
  ).join('\n\n');
}

describe('needsChunking', () => {
  it('does not chunk a document the size of the 12-page test PDF', () => {
    // The test PDF has ~35k characters; even 3x that stays a single call.
    expect(needsChunking(pages(12, 9_000))).toBe(false);
    expect(needsChunking('a'.repeat(CHUNKING_THRESHOLD_CHARS))).toBe(false);
    expect(needsChunking('a'.repeat(CHUNKING_THRESHOLD_CHARS + 1))).toBe(true);
  });
});

describe('planChunks and isTooLong', () => {
  it('keeps a short document as one text', () => {
    const text = pages(12, 3_000);
    expect(planChunks(text)).toEqual([text]);
    expect(isTooLong(text, planChunks(text))).toBe(false);
  });

  it('accepts a document at the character limit in at most MAX_CHUNKS chunks', () => {
    // 60 pages of ~5k characters = just under 300k characters.
    const text = pages(60, 4_970);
    expect(text.length).toBeLessThanOrEqual(MAX_DOCUMENT_CHARS);
    const chunks = planChunks(text);
    expect(chunks.length).toBeLessThanOrEqual(MAX_CHUNKS);
    expect(isTooLong(text, chunks)).toBe(false);
  });

  it('rejects text over the character limit or needing more than MAX_CHUNKS chunks', () => {
    const tooManyChars = 'a'.repeat(MAX_DOCUMENT_CHARS + 1);
    expect(isTooLong(tooManyChars, planChunks(tooManyChars))).toBe(true);
    // Under the character limit, but packed into 4 chunks.
    const fourChunks = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(CHUNK_MAX_CHARS / 2));
    expect(isTooLong(fourChunks.join(''), fourChunks)).toBe(true);
  });
});

describe('splitIntoChunks', () => {
  it('packs whole pages into chunks up to the limit, in order', () => {
    const chunks = splitIntoChunks(pages(5, 40), 120);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.startsWith('--- Strona 1 ---')).toBe(true);
    expect(chunks[0]).toContain('--- Strona 2 ---');
    expect(chunks[1]?.startsWith('--- Strona 3 ---')).toBe(true);
    expect(chunks[2]?.startsWith('--- Strona 5 ---')).toBe(true);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
  });

  it('keeps every page exactly once', () => {
    const text = pages(30, 1_000);
    const joined = splitIntoChunks(text, 5_000).join('\n\n');
    for (let page = 1; page <= 30; page += 1) {
      expect(joined.split(`--- Strona ${page} ---`)).toHaveLength(2);
    }
  });

  it('cuts a page longer than the limit, preferring line breaks', () => {
    const longPage = `--- Strona 1 ---\n${'linia tekstu\n'.repeat(50)}`;
    const chunks = splitIntoChunks(longPage, 100);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.every((chunk) => !chunk.startsWith('\n'))).toBe(true);
    expect(chunks.join('\n').replace(/\n/g, '')).toBe(longPage.trim().replace(/\n/g, ''));
  });

  it('treats text without page markers as one page', () => {
    expect(splitIntoChunks('krótki tekst', 100)).toEqual(['krótki tekst']);
  });
});

function chunkResult(changes: Partial<AnalysisResult>): AnalysisResult {
  return { ...sampleResult, ...changes };
}

describe('mergeChunkResults', () => {
  it('merges deterministically: dedupe, one date per day, round-robin key points', () => {
    const first = chunkResult({
      document: { ...sampleResult.document, title: null, date: null },
      keyPoints: ['A1', 'A2', 'A3', 'A4', 'A5'],
      entities: { organizations: ['Nordwave Logistics'], people: ['Anna Kowalczyk'] },
      amounts: [{ value: 184500, currency: 'PLN', context: 'wynagrodzenie' }],
      dates: [{ date: '2026-04-01', context: 'początek obowiązywania umowy' }],
      keywords: ['wdrożenie', 'SLA'],
    });
    const second = chunkResult({
      document: { ...sampleResult.document, title: 'Umowa nr 14', date: '2026-03-12' },
      keyPoints: ['B1', 'a1', 'B3', 'B4'],
      entities: {
        organizations: ['NORDWAVE LOGISTICS', 'Kwadrat Software'],
        people: ['anna kowalczyk', 'Paweł Dąbrowski'],
      },
      amounts: [
        { value: 184500, currency: 'PLN', context: 'Wynagrodzenie' },
        { value: 8600, currency: 'EUR', context: 'licencje rocznie' },
      ],
      dates: [
        { date: '2026-04-01', context: 'start etapu E1' },
        { date: '2026-03-12', context: 'zawarcie umowy' },
      ],
      keywords: ['sla', 'hosting'],
    });

    const merged = mergeChunkResults([first, second], 'Podsumowanie całości.');

    expect(merged.document.title).toBe('Umowa nr 14');
    expect(merged.document.date).toBe('2026-03-12');
    expect(merged.entities.organizations).toEqual(['Nordwave Logistics', 'Kwadrat Software']);
    expect(merged.entities.people).toEqual(['Anna Kowalczyk', 'Paweł Dąbrowski']);
    expect(merged.amounts).toEqual([
      { value: 184500, currency: 'PLN', context: 'wynagrodzenie' },
      { value: 8600, currency: 'EUR', context: 'licencje rocznie' },
    ]);
    expect(merged.dates).toEqual([
      { date: '2026-03-12', context: 'zawarcie umowy' },
      { date: '2026-04-01', context: 'początek obowiązywania umowy; start etapu E1' },
    ]);
    expect(merged.keyPoints).toEqual(['A1', 'B1', 'A2', 'A3', 'B3', 'A4', 'B4']);
    expect(merged.keyPoints).toHaveLength(MAX_KEY_POINTS);
    expect(merged.keywords).toEqual(['wdrożenie', 'SLA', 'hosting']);
    expect(merged.summary).toBe('Podsumowanie całości.');
  });

  it('picks language and type by majority, ties going to the earlier chunk', () => {
    const pl = chunkResult({});
    const en = chunkResult({
      document: { ...sampleResult.document, language: 'en', type: 'inne' },
    });

    expect(mergeChunkResults([en, pl, pl], 'x').document).toMatchObject({
      language: 'pl',
      type: 'umowa',
    });
    expect(mergeChunkResults([en, pl], 'x').document).toMatchObject({
      language: 'en',
      type: 'inne',
    });
  });
});
