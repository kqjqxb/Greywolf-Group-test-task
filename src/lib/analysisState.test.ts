import { describe, expect, it } from 'vitest';
import { analysisReducer, initialAnalysisState, isBusy, type AnalysisState } from './analysisState';
import { sampleResult } from './fixtures/sample-result';

const file = new File(['%PDF-'], 'umowa.pdf', { type: 'application/pdf' });

describe('analysisReducer', () => {
  it('goes through the happy path idle → reading → analyzing → success', () => {
    let state: AnalysisState = initialAnalysisState;
    state = analysisReducer(state, { type: 'start', file, now: 1000 });
    expect(state).toEqual({ status: 'reading', file, startedAt: 1000 });
    expect(isBusy(state)).toBe(true);

    state = analysisReducer(state, { type: 'extracted', emptyPages: [11] });
    expect(state).toEqual({ status: 'analyzing', file, startedAt: 1000, emptyPages: [11] });

    state = analysisReducer(state, { type: 'succeeded', result: sampleResult });
    expect(state).toEqual({ status: 'success', file, result: sampleResult, emptyPages: [11] });
    expect(isBusy(state)).toBe(false);
  });

  it('moves to error from any step and back to idle on reset', () => {
    const reading = analysisReducer(initialAnalysisState, { type: 'start', file, now: 0 });
    const error = analysisReducer(reading, { type: 'failed', code: 'timeout', file });
    expect(error).toEqual({ status: 'error', file, code: 'timeout' });
    expect(analysisReducer(error, { type: 'reset' })).toEqual(initialAnalysisState);
  });

  it('ignores out-of-order events', () => {
    expect(analysisReducer(initialAnalysisState, { type: 'extracted', emptyPages: [] })).toBe(
      initialAnalysisState,
    );
    expect(analysisReducer(initialAnalysisState, { type: 'succeeded', result: sampleResult })).toBe(
      initialAnalysisState,
    );
  });
});
