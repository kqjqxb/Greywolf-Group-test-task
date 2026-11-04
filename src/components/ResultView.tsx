import { useEffect, useRef, type ReactNode } from 'react';
import {
  formatAmount,
  formatDate,
  formatDocumentType,
  formatLanguage,
  formatPageCount,
} from '../lib/format';
import type { ExtractionFindings } from '../lib/analysisState';
import type { AnalysisResult } from '../lib/schema';
import { EmptyPagesWarning } from './EmptyPagesWarning';
import { InjectionNotice } from './InjectionNotice';
import { JsonPanel } from './JsonPanel';

interface ResultViewProps {
  result: AnalysisResult;
  /** Name of the uploaded file (used for the JSON file name). */
  pdfFileName: string;
  findings: ExtractionFindings;
  onNewFile: () => void;
}

const NO_DATA = <p className="muted">Brak danych</p>;

/** Renders `items` as a list, or "Brak danych" when empty (never hides a section silently). */
function ListOrEmpty<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  if (items.length === 0) {
    return NO_DATA;
  }
  return (
    <ul className="list">
      {items.map((item, index) => (
        <li key={index}>{render(item)}</li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3 className="card__title">{title}</h3>
      {children}
    </section>
  );
}

/** F-05: readable results. All values are rendered as text nodes (escaped by React). */
export function ResultView({ result, pdfFileName, findings, onNewFile }: ResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { document: doc } = result;

  // Move focus to the results so screen reader users hear that the analysis is done.
  useEffect(() => {
    headingRef.current?.focus();
  }, [result]);

  return (
    <div className="results">
      <div className="results__header">
        <h2 ref={headingRef} tabIndex={-1} className="results__title">
          Wynik analizy
        </h2>
        <button type="button" className="button button--secondary" onClick={onNewFile}>
          Analizuj inny plik
        </button>
      </div>

      <EmptyPagesWarning pages={findings.emptyPages} />
      {findings.injectionSuspected && <InjectionNotice />}

      <section className="card" aria-labelledby="doc-title">
        <p className="eyebrow">{formatDocumentType(doc.type)}</p>
        <h3 id="doc-title" className="doc-title">
          {doc.title ?? 'Dokument bez tytułu'}
        </h3>
        <dl className="facts">
          <div>
            <dt>Plik</dt>
            <dd className="break">{doc.fileName}</dd>
          </div>
          <div>
            <dt>Język</dt>
            <dd>{formatLanguage(doc.language)}</dd>
          </div>
          <div>
            <dt>Data dokumentu</dt>
            <dd>
              {doc.date ? <time dateTime={doc.date}>{formatDate(doc.date)}</time> : 'Brak danych'}
            </dd>
          </div>
          <div>
            <dt>Liczba stron</dt>
            <dd>{formatPageCount(doc.pages)}</dd>
          </div>
        </dl>
      </section>

      <Section title="Podsumowanie">
        <p className="summary">{result.summary}</p>
      </Section>

      <Section title="Najważniejsze punkty">
        <ListOrEmpty items={result.keyPoints} render={(point) => point} />
      </Section>

      <div className="grid">
        <Section title="Organizacje">
          <ListOrEmpty items={result.entities.organizations} render={(name) => name} />
        </Section>
        <Section title="Osoby">
          <ListOrEmpty items={result.entities.people} render={(name) => name} />
        </Section>
      </div>

      <Section title="Kwoty">
        <ListOrEmpty
          items={result.amounts}
          render={(amount) => (
            <>
              <span className="value">{formatAmount(amount.value, amount.currency)}</span>
              <span className="context">{amount.context}</span>
            </>
          )}
        />
      </Section>

      <Section title="Daty">
        <ListOrEmpty
          items={result.dates}
          render={(entry) => (
            <>
              <time className="value" dateTime={entry.date}>
                {formatDate(entry.date)}
              </time>
              <span className="context">{entry.context}</span>
            </>
          )}
        />
      </Section>

      <Section title="Słowa kluczowe">
        {result.keywords.length === 0 ? (
          NO_DATA
        ) : (
          <ul className="tags">
            {result.keywords.map((keyword, index) => (
              <li key={index} className="tag">
                {keyword}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <JsonPanel result={result} pdfFileName={pdfFileName} />
    </div>
  );
}
