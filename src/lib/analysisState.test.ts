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
