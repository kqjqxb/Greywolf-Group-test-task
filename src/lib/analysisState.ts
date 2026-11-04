import type { AppErrorCode } from './errors';
import type { AnalysisResult, AnalyzeMeta } from './schema';

/**
 * UI state machine (F-06). Each state carries only the data valid in it,
 * so e.g. a result can never be shown together with an error.
 *
 *   idle ──start──▶ reading ──extracted──▶ analyzing ──succeeded──▶ success
 *                      │                       │
 *                      └───────failed──────────┴──▶ error
 *   reading ──ocrPage──▶ reading (only the progress label changes, F-10)
 *   any state ──start──▶ reading (new file or retry) · any state ──reset──▶ idle
 *   any state ──openHistory──▶ success (a result saved in the browser, F-09)
 */
export type AnalysisState =
  | { status: 'idle' }
  /** `ocrPage` is the page being read with OCR right now, or null while pdf.js reads the text. */
  | { status: 'reading'; file: File; startedAt: number; ocrPage: number | null }
  | { status: 'analyzing'; file: File; startedAt: number; findings: ExtractionFindings }
  | { status: 'success'; analysis: CompletedAnalysis }
  /** `file` is null when the error happened before a valid file was accepted. */
  | { status: 'error'; file: File | null; code: AppErrorCode };

/** What the browser noticed in the PDF text before the analysis; shown next to the result. */
export interface ExtractionFindings {
  /** 1-based numbers of pages without a text layer. */
  emptyPages: number[];
  /** 1-based numbers of pages whose text was recognised with OCR (F-10). */
  ocrPages: number[];
  /** Some scanned pages were not OCR'd because of the page limit. */
  ocrLimitReached: boolean;
  /** The text contains phrases that look like instructions for an AI (see lib/injection.ts). */
  injectionSuspected: boolean;
}

/** Everything the result view needs; also what is saved in the history (lib/history.ts). */
export interface CompletedAnalysis {
  fileName: string;
  result: AnalysisResult;
  /** Diagnostics from the worker (model, cache, time); null when the worker sent none. */
  meta: AnalyzeMeta | null;
  findings: ExtractionFindings;
  /** When the analysis finished, ISO 8601 date-time. */
  analyzedAt: string;
}

export type AnalysisAction =
  | { type: 'start'; file: File; now: number }
  | { type: 'ocrPage'; page: number }
  | { type: 'extracted'; findings: ExtractionFindings }
  | { type: 'succeeded'; analysis: CompletedAnalysis }
  | { type: 'openHistory'; analysis: CompletedAnalysis }
  | { type: 'failed'; code: AppErrorCode; file: File | null }
  | { type: 'reset' };

export const initialAnalysisState: AnalysisState = { status: 'idle' };

export function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'start':
      return { status: 'reading', file: action.file, startedAt: action.now, ocrPage: null };
    case 'ocrPage':
      if (state.status !== 'reading') {
        return state;
      }
      return { ...state, ocrPage: action.page };
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
      return { status: 'success', analysis: action.analysis };
    case 'openHistory':
      return { status: 'success', analysis: action.analysis };
    case 'failed':
      return { status: 'error', file: action.file, code: action.code };
    case 'reset':
      return initialAnalysisState;
  }
}

export function isBusy(state: AnalysisState): boolean {
  return state.status === 'reading' || state.status === 'analyzing';
}
