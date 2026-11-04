import { describe, expect, it } from 'vitest';
import { analysisReducer, initialAnalysisState, isBusy, type AnalysisState } from './analysisState';
import { sampleResult } from './fixtures/sample-result';

const file = new File(['%PDF-'], 'umowa.pdf', { type: 'application/pdf' });
const findings = {
  emptyPages: [11],
  ocrPages: [],
  ocrLimitReached: false,
  injectionSuspected: true,
};
const analysis = {
  fileName: 'umowa.pdf',
  result: sampleResult,
  meta: null,
  findings,
  analyzedAt: '2026-11-04T12:00:00.000Z',
};

describe('analysisReducer', () => {
  it('goes through the happy path idle → reading → analyzing → success', () => {
    let state: AnalysisState = initialAnalysisState;
    state = analysisReducer(state, { type: 'start', file, now: 1000 });
    expect(state).toEqual({ status: 'reading', file, startedAt: 1000, ocrPage: null });
    expect(isBusy(state)).toBe(true);

    state = analysisReducer(state, { type: 'ocrPage', page: 11 });
    expect(state).toEqual({ status: 'reading', file, startedAt: 1000, ocrPage: 11 });

    state = analysisReducer(state, { type: 'extracted', findings });
    expect(state).toEqual({ status: 'analyzing', file, startedAt: 1000, findings });

    state = analysisReducer(state, { type: 'succeeded', analysis });
    expect(state).toEqual({ status: 'success', analysis });
    expect(isBusy(state)).toBe(false);
  });

  it('moves to error from any step and back to idle on reset', () => {
    const reading = analysisReducer(initialAnalysisState, { type: 'start', file, now: 0 });
    const error = analysisReducer(reading, { type: 'failed', code: 'timeout', file });
    expect(error).toEqual({ status: 'error', file, code: 'timeout' });
    expect(analysisReducer(error, { type: 'reset' })).toEqual(initialAnalysisState);
  });

  it('ignores out-of-order events', () => {
    expect(analysisReducer(initialAnalysisState, { type: 'extracted', findings })).toBe(
      initialAnalysisState,
    );
    expect(analysisReducer(initialAnalysisState, { type: 'succeeded', analysis })).toBe(
      initialAnalysisState,
    );
    expect(analysisReducer(initialAnalysisState, { type: 'ocrPage', page: 1 })).toBe(
      initialAnalysisState,
    );
  });

  it('opens a saved analysis from the history from any state', () => {
    expect(analysisReducer(initialAnalysisState, { type: 'openHistory', analysis })).toEqual({
      status: 'success',
      analysis,
    });
  });
});

describe('isBusy (drives the beforeunload warning)', () => {
  const reading = analysisReducer(initialAnalysisState, { type: 'start', file, now: 0 });
  const ocr = analysisReducer(reading, { type: 'ocrPage', page: 3 });
  const analyzing = analysisReducer(ocr, { type: 'extracted', findings });
  const success = analysisReducer(analyzing, { type: 'succeeded', analysis });
  const error = analysisReducer(analyzing, { type: 'failed', code: 'timeout', file });
  const fromHistory = analysisReducer(initialAnalysisState, { type: 'openHistory', analysis });

  it('is true while the PDF is read, OCR runs or the AI is working', () => {
    expect(isBusy(reading)).toBe(true);
    expect(isBusy(ocr)).toBe(true);
    expect(isBusy(analyzing)).toBe(true);
  });

  it('is false when nothing would be lost by leaving the page', () => {
    expect(isBusy(initialAnalysisState)).toBe(false);
    expect(isBusy(success)).toBe(false);
    expect(isBusy(error)).toBe(false);
    expect(isBusy(fromHistory)).toBe(false);
    expect(isBusy(analysisReducer(analyzing, { type: 'reset' }))).toBe(false);
  });
});
