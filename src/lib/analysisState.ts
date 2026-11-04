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
  | { status: 'analyzing'; file: File; startedAt: number; findings: ExtractionFindings }
  | { status: 'success'; file: File; result: AnalysisResult; findings: ExtractionFindings }
  /** `file` is null when the error happened before a valid file was accepted. */
  | { status: 'error'; file: File | null; code: AppErrorCode };

/** What the browser noticed in the PDF text before the analysis; shown next to the result. */
export interface ExtractionFindings {
  /** 1-based numbers of pages without a text layer. */
  emptyPages: number[];
  /** The text contains phrases that look like instructions for an AI (see lib/injection.ts). */
  injectionSuspected: boolean;
}

export type AnalysisAction =
  | { type: 'start'; file: File; now: number }
  | { type: 'extracted'; findings: ExtractionFindings }
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
        findings: action.findings,
      };
    case 'succeeded':
      if (state.status !== 'analyzing') {
        return state;
      }
      return {
        status: 'success',
        file: state.file,
        result: action.result,
        findings: state.findings,
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
