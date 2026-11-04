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
import {
  analyzeDocument,
  maxClaudeCalls,
  validateModelOutput,
  validateSummaryOutput,
} from './analyze';
import { CHUNK_MAX_CHARS, CHUNKING_THRESHOLD_CHARS, MAX_KEYWORDS } from './chunking';
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

  it('trims keywords to MAX_KEYWORDS after dedupe instead of rejecting the answer', () => {
    const keywords = Array.from({ length: 14 }, (_, i) => `słowo ${i + 1}`);
    const validation = validateModelOutput(
      answerWith({ keywords: ['SLA', 'sla', ...keywords] }),
      REQUEST,
    );
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.keywords).toHaveLength(MAX_KEYWORDS);
      expect(validation.value.keywords).toEqual(['SLA', ...keywords.slice(0, MAX_KEYWORDS - 1)]);
    }
  });
});

describe('maxClaudeCalls', () => {
  it('counts first call + retry for every task, including the summary of a chunked document', () => {
    expect(maxClaudeCalls(1)).toBe(2);
    expect(maxClaudeCalls(2)).toBe(6);
    expect(maxClaudeCalls(3)).toBe(8);
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

  it('accepts a 3-sentence summary in a script without capitals', () => {
    const summary = '本合同由两家公司签订。合同金额为十万元。合同有效期为两年。';
    expect(validateSummaryOutput(JSON.stringify({ summary }))).toEqual({
      ok: true,
      value: summary,
    });
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

  it('fails the request when the summary call fails (no partial summary)', async () => {
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

    expect(outcome).toMatchObject({ ok: false, error: 'ai_unavailable', stats: { paidCalls: 3 } });
  });

  it('fails with ai_invalid_response when the summary stays invalid after the retry', async () => {
    const clock = fakeClock();
    const oneSentence: ScriptedCall = {
      ms: 1_000,
      result: { ok: true, text: '{"summary": "Tylko jedno zdanie."}' },
    };
    const claude = scriptedProvider(
      'claude',
      [okAnswer(), okAnswer(), oneSentence, oneSentence],
      clock,
      [],
      true,
    );

    const outcome = await analyzeDocument(
      { ...REQUEST, text: longDocument(4) },
      { providers: [claude.provider], now: clock.now },
    );

    expect(outcome).toMatchObject({ ok: false, error: 'ai_invalid_response' });
  });

  it('fails with ai_timeout when no time is left for the summary call', async () => {
    const clock = fakeClock();
    // Both chunks run in parallel on the fake clock, so their durations add up: 2 × 11.5 s = 23 s, 3 s left.
    const claude = scriptedProvider(
      'claude',
      [okAnswer(11_500), okAnswer(11_500)],
      clock,
      [],
      true,
    );

    const outcome = await analyzeDocument(
      { ...REQUEST, text: longDocument(4) },
      { providers: [claude.provider], now: clock.now },
    );

    expect(outcome).toMatchObject({ ok: false, error: 'ai_timeout' });
    expect(claude.calls).toHaveLength(2);
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
