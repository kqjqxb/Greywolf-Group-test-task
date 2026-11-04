import type { AppErrorCode } from './errors';
import type { AnalysisResult } from './schema';

/**
 * UI state machine (F-06). Each state carries only the data valid in it,
 * so e.g. a result can never be shown together with an error.
 *
 *   idle ──start──▶ reading ──extracted──▶ analyzing ──succeeded──▶ success
 *                      │                       │
 *                      └───────failed──────────┴──▶ error
 *   any state ──start──▶ reading (new file or retry) · any state ──reset──▶ idle
 */
export type AnalysisState =
  | { status: 'idle' }
  | { status: 'reading'; file: File; startedAt: number }
  | { status: 'analyzing'; file: File; startedAt: number; emptyPages: number[] }
  | { status: 'success'; file: File; result: AnalysisResult; emptyPages: number[] }
  /** `file` is null when the error happened before a valid file was accepted. */
  | { status: 'error'; file: File | null; code: AppErrorCode };

export type AnalysisAction =
  | { type: 'start'; file: File; now: number }
  | { type: 'extracted'; emptyPages: number[] }
  | { type: 'succeeded'; result: AnalysisResult }
  | { type: 'failed'; code: AppErrorCode; file: File | null }
  | { type: 'reset' };

export const initialAnalysisState: AnalysisState = { status: 'idle' };

export function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'start':
      return { status: 'reading', file: action.file, startedAt: action.now };
    case 'extracted':
      if (state.status !== 'reading') {
        return state;
      }
      return {
        status: 'analyzing',
        file: state.file,
        startedAt: state.startedAt,
        emptyPages: action.emptyPages,
      };
    case 'succeeded':
      if (state.status !== 'analyzing') {
        return state;
      }
      return {
        status: 'success',
        file: state.file,
        result: action.result,
        emptyPages: state.emptyPages,
      };
    case 'failed':
      return { status: 'error', file: action.file, code: action.code };
    case 'reset':
      return initialAnalysisState;
  }
}

export function isBusy(state: AnalysisState): boolean {
  return state.status === 'reading' || state.status === 'analyzing';
}
