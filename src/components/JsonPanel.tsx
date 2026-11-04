import { useMemo, useState } from 'react';
import { deriveJsonFileName, downloadJson, toPrettyJson } from '../lib/download';
import type { AnalysisResult } from '../lib/schema';
import { CodeIcon, CopyIcon, DownloadIcon } from './icons';

interface JsonPanelProps {
  result: AnalysisResult;
  pdfFileName: string;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

/** F-05: JSON preview (plain text in <pre>), download and copy. */
export function JsonPanel({ result, pdfFileName }: JsonPanelProps) {
  const json = useMemo(() => toPrettyJson(result), [result]);
  const jsonFileName = deriveJsonFileName(pdfFileName);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    // Not printed: buttons and a JSON dump are useless on paper.
    <section className="card dashboard__wide no-print" aria-labelledby="json-title">
      <h3 id="json-title" className="card__title">
        <CodeIcon />
        Wynik w formacie JSON
      </h3>
      <div className="actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => downloadJson(json, jsonFileName)}
        >
          <DownloadIcon />
          Pobierz JSON
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void handleCopy()}
        >
          <CopyIcon />
          Kopiuj JSON
        </button>
        <span className="actions__status" role="status">
          {copyStatus === 'copied' && 'Skopiowano do schowka.'}
          {copyStatus === 'failed' && 'Nie udało się skopiować. Zaznacz tekst poniżej ręcznie.'}
        </span>
      </div>
      <p className="json-panel__file">Plik: {jsonFileName}</p>
      <details className="json-preview">
        <summary>Pokaż podgląd JSON</summary>
        {/* Rendered as a text node: React escapes it, nothing is parsed as HTML. */}
        <pre tabIndex={0} aria-label="Podgląd JSON">
          {json}
        </pre>
      </details>
    </section>
  );
}
