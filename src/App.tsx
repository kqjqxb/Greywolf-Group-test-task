import { useReducer, useRef } from 'react';
import { analyze } from './api/client';
import { AppHeader } from './components/AppHeader';
import { EmptyState } from './components/EmptyState';
import { ErrorView } from './components/ErrorView';
import { PrivacyNotice } from './components/PrivacyNotice';
import { ProgressView } from './components/ProgressView';
import { ResultView } from './components/ResultView';
import { UploadZone } from './components/UploadZone';
import { analysisReducer, initialAnalysisState, type AnalysisState } from './lib/analysisState';
import { buildAnalyzeRequest } from './lib/analyzeRequest';
import { AppError, errorMessage, isRetryable, toErrorCode } from './lib/errors';
import { validatePdfFile } from './lib/fileValidation';
import { extractPdfText } from './lib/pdf';

/** Text for the screen reader live region, one per state. */
function announcement(state: AnalysisState): string {
  switch (state.status) {
    case 'idle':
      return '';
    case 'reading':
      return 'Odczytywanie pliku PDF.';
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

  /** Full flow for one file: validate → extract text → call the API. */
  async function runAnalysis(file: File) {
    dispatch({ type: 'start', file, now: Date.now() });
    try {
      const fileError = await validatePdfFile(file);
      if (fileError) {
        throw new AppError(fileError);
      }
      const { pageTexts, emptyPages } = await extractPdfText(await file.arrayBuffer());
      const request = buildAnalyzeRequest(file.name, pageTexts);
      dispatch({ type: 'extracted', emptyPages });
      const result = await analyze(request);
      dispatch({ type: 'succeeded', result });
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
    // The input is rendered again after the reset; focus it on the next frame.
    requestAnimationFrame(() => fileInputRef.current?.focus());
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
          </>
        )}

        {(state.status === 'reading' || state.status === 'analyzing') && (
          <ProgressView
            step={state.status}
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
          <ResultView
            result={state.result}
            pdfFileName={state.file.name}
            emptyPages={state.emptyPages}
            onNewFile={pickAnotherFile}
          />
        )}
      </main>
      <footer className="footer">
        <p>
          PDF Insight · plik jest odczytywany w przeglądarce, do analizy AI trafia tylko jego tekst.
        </p>
      </footer>
    </>
  );
}
