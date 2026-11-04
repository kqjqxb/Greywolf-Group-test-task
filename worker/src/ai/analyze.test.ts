import { describe, expect, it } from 'vitest';
import { sampleResult } from '../../../src/lib/fixtures/sample-result';
import type { AnalyzeRequest } from '../../../src/lib/schema';
import {
  fakeClock,
  failure,
  okAnswer,
  scriptedProvider,
  validModelAnswer,
  type ScriptedCall,
} from '../testing/fakeProvider';
import { analyzeDocument, validateModelOutput, validateSummaryOutput } from './analyze';
import { CHUNK_MAX_CHARS, CHUNKING_THRESHOLD_CHARS } from './chunking';
import { PROMPT_VERSION, SUMMARY_SYSTEM_INSTRUCTION } from './prompt';

const REQUEST: AnalyzeRequest = { fileName: 'umowa-14.pdf', pages: 12, text: 'Treść umowy.' };

function answerWith(changes: Record<string, unknown>): string {
  return JSON.stringify({
    ...(JSON.parse(validModelAnswer()) as Record<string, unknown>),
    ...changes,
  });
}

describe('validateModelOutput', () => {
  it('overrides fileName/pages produced by the model with the request values', () => {
    const validation = validateModelOutput(JSON.stringify(sampleResult), REQUEST);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.document.fileName).toBe('umowa-14.pdf');
      expect(validation.value.document.pages).toBe(12);
    }
  });

  it('rejects a summary with fewer than 3 or more than 5 sentences', () => {
    const short = validateModelOutput(
      answerWith({ summary: 'Jedno zdanie. Drugie zdanie.' }),
      REQUEST,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.problems[0]).toContain('2 sentences');
    }
    const long = 'Raz jest. Dwa są. Trzy są. Cztery są. Pięć jest. Sześć jest.';
    expect(validateModelOutput(answerWith({ summary: long }), REQUEST).ok).toBe(false);
  });

  it('reports schema problems by field path', () => {
    const validation = validateModelOutput(
      answerWith({ amounts: [{ value: 1, currency: 'zł', context: 'x' }] }),
      REQUEST,
    );
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.problems.join('\n')).toContain('amounts.0.currency');
    }
  });

  it('keeps exactly one entry per date, merging contexts (for every provider)', () => {
    const validation = validateModelOutput(
      answerWith({
        dates: [
          { date: '2026-04-01', context: 'początek obowiązywania umowy' },
          { date: '2026-03-12', context: 'zawarcie umowy' },
          { date: '2026-04-01', context: 'start etapu E1' },
          { date: '2026-04-01', context: 'Start etapu E1' },
        ],
      }),
      REQUEST,
    );
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.dates).toEqual([
        { date: '2026-03-12', context: 'zawarcie umowy' },
        { date: '2026-04-01', context: 'początek obowiązywania umowy; start etapu E1' },
      ]);
    }
  });

  it('removes duplicate amounts, organizations and keywords', () => {
    const amount = { value: 184500, currency: 'PLN', context: 'wynagrodzenie netto' };
    const validation = validateModelOutput(
      answerWith({
        amounts: [amount, { ...amount, context: 'Wynagrodzenie netto ' }],
        entities: { organizations: ['Nordwave Logistics', 'nordwave logistics'], people: [] },
        keywords: ['SLA', 'sla', 'wdrożenie'],
      }),
      REQUEST,
    );
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.amounts).toEqual([amount]);
      expect(validation.value.entities.organizations).toEqual(['Nordwave Logistics']);
      expect(validation.value.keywords).toEqual(['SLA', 'wdrożenie']);
    }
  });
});

describe('validateSummaryOutput', () => {
  it('accepts 3–5 sentences and rejects anything else', () => {
    expect(validateSummaryOutput('{"summary": "Raz. Dwa. Trzy."}')).toEqual({
      ok: true,
      value: 'Raz. Dwa. Trzy.',
    });
    expect(validateSummaryOutput('{"summary": "Raz."}').ok).toBe(false);
    expect(validateSummaryOutput('nie json').ok).toBe(false);
  });
});

describe('analyzeDocument — single call', () => {
  it('returns meta with model, prompt version, duration and chunks = 1', async () => {
    const clock = fakeClock();
    const claude = scriptedProvider('claude', [okAnswer(4_000)], clock, [], true);

    const outcome = await analyzeDocument(REQUEST, {
      providers: [claude.provider],
      now: clock.now,
    });

    expect(outcome).toMatchObject({
      ok: true,
      meta: { model: 'claude', promptVersion: PROMPT_VERSION, durationMs: 4_000, chunks: 1 },
      stats: { paidCalls: 1 },
    });
  });

  it('returns stats also when it fails (failed calls count towards the budget)', async () => {
    const clock = fakeClock();
    const claude = scriptedProvider('claude', [failure('unavailable')], clock, [], true);

    const outcome = await analyzeDocument(REQUEST, {
      providers: [claude.provider],
      now: clock.now,
    });

    expect(outcome).toMatchObject({ ok: false, error: 'ai_unavailable', stats: { paidCalls: 1 } });
  });
});

/** Text with page markers; two pages (each a bit under half a chunk) fit into one chunk. */
function longDocument(pages: number): string {
  const page = 'x'.repeat(CHUNK_MAX_CHARS / 2 - 1_000);
  return Array.from({ length: pages }, (_, i) => `--- Strona ${i + 1} ---\n${page}`).join('\n\n');
}

describe('analyzeDocument — long documents (F-08)', () => {
  const summaryAnswer: ScriptedCall = {
    ms: 1_000,
    result: {
      ok: true,
      text: '{"summary": "Całość jest umową. Strony są dwie. Wartość jest znana."}',
    },
  };

  it('analyzes chunks in parallel, merges them and rewrites the summary', async () => {
    const text = longDocument(4); // 4 pages, 2 per chunk → 2 chunks
    expect(text.length).toBeGreaterThan(CHUNKING_THRESHOLD_CHARS);
    const clock = fakeClock();
    const claude = scriptedProvider(
      'claude',
      [okAnswer(), okAnswer(), summaryAnswer],
      clock,
      [],
      true,
    );

    const outcome = await analyzeDocument(
      { ...REQUEST, text },
      { providers: [claude.provider], now: clock.now },
    );

    expect(outcome).toMatchObject({
      ok: true,
      meta: { model: 'claude', chunks: 2 },
      stats: { paidCalls: 3 },
    });
    if (outcome.ok) {
      expect(outcome.result.summary).toBe('Całość jest umową. Strony są dwie. Wartość jest znana.');
      // Identical chunk answers merge into the single-answer lists.
      expect(outcome.result.amounts).toEqual(sampleResult.amounts);
    }
    const prompts = claude.calls.map((call) => call.messages[0]?.text ?? '');
    expect(prompts[0]).toContain('part 1 of 2');
    expect(prompts[1]).toContain('part 2 of 2');
    expect(claude.calls[2]?.systemInstruction).toBe(SUMMARY_SYSTEM_INSTRUCTION);
    expect(claude.calls[2]?.output).toBe('summary');
  });

  it('keeps the first chunk summary when the summary call fails', async () => {
    const clock = fakeClock();
    const claude = scriptedProvider(
      'claude',
      [okAnswer(), okAnswer(), failure('unavailable')],
      clock,
      [],
      true,
    );

    const outcome = await analyzeDocument(
      { ...REQUEST, text: longDocument(4) },
      { providers: [claude.provider], now: clock.now },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.summary).toBe(sampleResult.summary);
    }
  });

  it('fails the request when any chunk fails', async () => {
    const clock = fakeClock();
    const claude = scriptedProvider(
      'claude',
      [okAnswer(), failure('rate_limited')],
      clock,
      [],
      true,
    );

    const outcome = await analyzeDocument(
      { ...REQUEST, text: longDocument(4) },
      { providers: [claude.provider], now: clock.now },
    );

    expect(outcome).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});
