import { useReducer, useRef, useState } from 'react';
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
  type AnalysisState,
  type CompletedAnalysis,
} from './lib/analysisState';
import { buildAnalyzeRequest } from './lib/analyzeRequest';
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
  const [state, dispatch] = useReducer(analysisReducer, initialAnalysisState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(historyStorage));

  /** Full flow for one file: validate → extract text (+ OCR) → call the API → save to history. */
  async function runAnalysis(file: File) {
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
      setHistory((current) => addToHistory(historyStorage, current, analysis, crypto.randomUUID()));
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
    dispatch({ type: 'reset' });
    focusFileInput();
  }

  function focusFileInput() {
    // The input may be rendered only after the next state update; focus it on the next frame.
    requestAnimationFrame(() => fileInputRef.current?.focus());
  }

  function removeHistoryEntry(id: string) {
    const next = removeFromHistory(historyStorage, history, id);
    setHistory(next);
    if (next.length === 0) {
      // The list (and the focused button) disappears; keep keyboard users in a sensible place.
      focusFileInput();
    }
  }

  function clearAllHistory() {
    setHistory(clearHistory(historyStorage));
    focusFileInput();
  }

  const retryFile = state.status === 'error' && isRetryable(state.code) ? state.file : null;

  return (
    <>
      <AppHeader />
      <main className="app">
        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement(state)}
        </p>

        {state.status === 'idle' && (
          <>
            <p className="lead">
              Wgraj plik PDF, a AI przygotuje krótkie podsumowanie i wyciągnie najważniejsze dane:
              strony dokumentu, kwoty, daty i słowa kluczowe. Wynik pobierzesz jako JSON.
            </p>
            <UploadZone onFiles={handleFiles} inputRef={fileInputRef} />
            <PrivacyNotice />
            <EmptyState />
            <HistoryList
              entries={history}
              onOpen={(entry) => dispatch({ type: 'openHistory', analysis: entry })}
              onRemove={removeHistoryEntry}
              onClear={clearAllHistory}
            />
          </>
        )}

        {(state.status === 'reading' || state.status === 'analyzing') && (
          <ProgressView
            step={state.status}
            ocrPage={state.status === 'reading' ? state.ocrPage : null}
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
        <p>
          PDF Insight · plik jest odczytywany w przeglądarce, do analizy AI trafia tylko jego tekst.
        </p>
      </footer>
    </>
  );
}
