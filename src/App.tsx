import { useEffect, useReducer, useRef, useState } from 'react';
import { analyze } from './api/client';
import { AppHeader } from './components/AppHeader';
import { EmptyState } from './components/EmptyState';
import { ErrorView } from './components/ErrorView';
import { HistoryList } from './components/HistoryList';
import { PrivacyNotice } from './components/PrivacyNotice';
import { ProgressView } from './components/ProgressView';
import { ResultView } from './components/ResultView';
import { UploadZone } from './components/UploadZone';
import {
  analysisReducer,
  initialAnalysisState,
  isBusy,
  type AnalysisState,
  type CompletedAnalysis,
} from './lib/analysisState';
import { buildAnalyzeRequest } from './lib/analyzeRequest';
import {
  browserSessionStorage,
  clearCurrentAnalysisId,
  loadCurrentAnalysis,
  loadCurrentAnalysisId,
  saveCurrentAnalysisId,
} from './lib/currentAnalysis';
import { AppError, errorMessage, isRetryable, toErrorCode } from './lib/errors';
import { validatePdfFile } from './lib/fileValidation';
import {
  addToHistory,
  browserStorage,
  clearHistory,
  loadHistory,
  removeFromHistory,
  type HistoryEntry,
} from './lib/history';
import { looksLikePromptInjection } from './lib/injection';
import { extractPdfText } from './lib/pdf';

/** localStorage for the history (F-09), or null when the browser blocks it. */
const historyStorage = browserStorage();
/** sessionStorage for the id of the result on screen (survives a reload of this tab). */
const sessionStore = browserSessionStorage();

/**
 * First state after a page load: the result that was on screen before a reload, if it is still in
 * the history; otherwise the empty state (also after a reload in the middle of an analysis).
 */
function restoreState(history: readonly HistoryEntry[]): AnalysisState {
  const entry = loadCurrentAnalysis(sessionStore, history);
  return entry ? { status: 'success', analysis: entry } : initialAnalysisState;
}

/** Makes the browser ask "Leave site?" (its own text; custom messages are ignored). */
function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
}

/** Text for the screen reader live region, one per state. */
function announcement(state: AnalysisState): string {
  switch (state.status) {
    case 'idle':
      return '';
    case 'reading':
      return state.ocrPage === null
        ? 'Odczytywanie pliku PDF.'
        : `Rozpoznawanie tekstu (OCR): strona ${state.ocrPage}.`;
    case 'analyzing':
      return 'Trwa analiza dokumentu przez AI.';
    case 'success':
      return 'Analiza zakończona. Wyniki są poniżej.';
    case 'error':
      return `Błąd: ${errorMessage(state.code)}`;
  }
}

export function App() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(historyStorage));
  const [state, dispatch] = useReducer(analysisReducer, history, restoreState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leaving the page while the PDF is read / OCR'd / analysed would lose the work: warn only then.
  const busy = isBusy(state);
  useEffect(() => {
    if (!busy) {
      return;
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [busy]);

  /** Full flow for one file: validate → extract text (+ OCR) → call the API → save to history. */
  async function runAnalysis(file: File) {
    // A reload from now on starts empty instead of showing the previous result.
    clearCurrentAnalysisId(sessionStore);
    dispatch({ type: 'start', file, now: Date.now() });
    try {
      const fileError = await validatePdfFile(file);
      if (fileError) {
        throw new AppError(fileError);
      }
      const { pageTexts, emptyPages, ocrPages, ocrLimitReached } = await extractPdfText(
        await file.arrayBuffer(),
        { onOcrPage: (page) => dispatch({ type: 'ocrPage', page }) },
      );
      const request = buildAnalyzeRequest(file.name, pageTexts);
      const findings = {
        emptyPages,
        ocrPages,
        ocrLimitReached,
        injectionSuspected: looksLikePromptInjection(pageTexts.join('\n')),
      };
      dispatch({ type: 'extracted', findings });
      const response = await analyze(request);
      const analysis: CompletedAnalysis = {
        fileName: file.name,
        result: response.result,
        meta: response.meta ?? null,
        findings,
        analyzedAt: new Date().toISOString(),
      };
      dispatch({ type: 'succeeded', analysis });
      const id = crypto.randomUUID();
      setHistory((current) => addToHistory(historyStorage, current, analysis, id));
      saveCurrentAnalysisId(sessionStore, id);
    } catch (error) {
      dispatch({ type: 'failed', code: toErrorCode(error), file });
    }
  }

  function handleFiles(files: File[]) {
    const [file] = files;
    if (files.length !== 1 || !file) {
      dispatch({ type: 'failed', code: 'file_multiple', file: null });
      return;
    }
    void runAnalysis(file);
  }

  function pickAnotherFile() {
    clearCurrentAnalysisId(sessionStore);
    dispatch({ type: 'reset' });
    focusFileInput();
  }

  function focusFileInput() {
    // The input may be rendered only after the next state update; focus it on the next frame.
    requestAnimationFrame(() => fileInputRef.current?.focus());
  }

  function openHistoryEntry(entry: HistoryEntry) {
    saveCurrentAnalysisId(sessionStore, entry.id);
    dispatch({ type: 'openHistory', analysis: entry });
  }

  function removeHistoryEntry(id: string) {
    if (loadCurrentAnalysisId(sessionStore) === id) {
      clearCurrentAnalysisId(sessionStore);
    }
    const next = removeFromHistory(historyStorage, history, id);
    setHistory(next);
    if (next.length === 0) {
      // The list (and the focused button) disappears; keep keyboard users in a sensible place.
      focusFileInput();
    }
  }

  function clearAllHistory() {
    clearCurrentAnalysisId(sessionStore);
    setHistory(clearHistory(historyStorage));
    focusFileInput();
  }

  const retryFile = state.status === 'error' && isRetryable(state.code) ? state.file : null;

  return (
    <>
      <AppHeader />
      <main className="container app">
        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement(state)}
        </p>

        {state.status === 'idle' && (
          <>
            <div className="hero">
              <h2 className="hero__title">
                Zamień PDF w <span className="hero__keyword">konkretne dane</span>
              </h2>
              <p className="hero__subtitle">
                AI streszcza PDF i wyciąga kwoty, daty, strony i słowa kluczowe.
              </p>
            </div>
            <UploadZone onFiles={handleFiles} inputRef={fileInputRef} />
            <PrivacyNotice />
            <EmptyState />
            <HistoryList
              entries={history}
              onOpen={openHistoryEntry}
              onRemove={removeHistoryEntry}
              onClear={clearAllHistory}
            />
          </>
        )}

        {(state.status === 'reading' || state.status === 'analyzing') && (
          <ProgressView
            step={state.status}
            ocrPage={state.status === 'reading' ? state.ocrPage : null}
            ocrUsed={state.status === 'analyzing' && state.findings.ocrPages.length > 0}
            fileName={state.file.name}
            startedAt={state.startedAt}
          />
        )}

        {state.status === 'error' && (
          <ErrorView
            code={state.code}
            onRetry={retryFile ? () => void runAnalysis(retryFile) : null}
            onPickAnother={pickAnotherFile}
          />
        )}

        {state.status === 'success' && (
          <ResultView analysis={state.analysis} onNewFile={pickAnotherFile} />
        )}
      </main>
      <footer className="footer no-print">
        <p className="container">
          PDF Insight · plik jest odczytywany w przeglądarce, do analizy AI trafia tylko jego tekst.
        </p>
      </footer>
    </>
  );
}
