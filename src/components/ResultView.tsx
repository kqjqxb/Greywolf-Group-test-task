import { useEffect, useRef, type ReactNode } from 'react';
import {
  formatDate,
  formatDateTime,
  formatDocumentType,
  formatDuration,
  formatLanguage,
  formatPageCount,
} from '../lib/format';
import type { CompletedAnalysis } from '../lib/analysisState';
import type { AnalyzeMeta } from '../lib/schema';
import { formatAmountValue, initials, keepLegalSuffixTogether } from './displayFormat';
import { ExtractionNotices } from './ExtractionNotices';
import {
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  CoinsIcon,
  FileTextIcon,
  ListIcon,
  TagIcon,
  UsersIcon,
} from './icons';
import { JsonPanel } from './JsonPanel';

interface ResultViewProps {
  analysis: CompletedAnalysis;
  onNewFile: () => void;
}

const NO_DATA = <p className="empty">Brak danych</p>;

interface CardProps {
  title: string;
  icon: ReactNode;
  wide?: boolean;
  /** Extra layout class, e.g. `dashboard__summary`. */
  className?: string;
  children: ReactNode;
}

/** One dashboard card; `wide` spans the full row on large screens. */
function Card({ title, icon, wide = false, className, children }: CardProps) {
  const classes = ['card', wide ? 'dashboard__wide' : '', className ?? ''].filter(Boolean);
  return (
    <section className={classes.join(' ')}>
      <h3 className="card__title">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** How the result was produced, e.g. "Model: claude-haiku-5-5 · z pamięci podręcznej · 0,4 s". */
function MetaLine({ meta }: { meta: AnalyzeMeta }) {
  const parts = [`Model: ${meta.model}`];
  if (meta.cached === true) {
    parts.push('z pamięci podręcznej');
  }
  parts.push(`czas analizy: ${formatDuration(meta.durationMs)}`);
  return <p className="result-meta">{parts.join(' · ')}</p>;
}

/**
 * F-05: readable results as a dashboard. All values are rendered as text nodes (escaped by
 * React). Elements marked `no-print` are hidden when the page is printed or saved as PDF.
 */
export function ResultView({ analysis, onNewFile }: ResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { result, findings, meta } = analysis;
  const { document: doc, entities } = result;

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
        <button type="button" className="button button--secondary no-print" onClick={onNewFile}>
          Analizuj inny plik
        </button>
      </div>
      <p className="print-only">
        Plik: {analysis.fileName} · Data analizy:{' '}
        <time dateTime={analysis.analyzedAt}>{formatDateTime(analysis.analyzedAt)}</time>
      </p>

      <div className="dashboard reveal">
        <ExtractionNotices findings={findings} />

        <section className="card dashboard__doc" aria-labelledby="doc-title">
          <div className="doc-card__top">
            <span className="badge">{formatDocumentType(doc.type)}</span>
            <span className="doc-card__file">
              <FileTextIcon />
              <span className="visually-hidden">Plik: </span>
              {doc.fileName}
            </span>
          </div>
          <h3 id="doc-title" className="doc-card__title">
            {doc.title ?? 'Dokument bez tytułu'}
          </h3>
          <dl className="meta-chips">
            <div className="meta-chip">
              <dt>Język</dt>
              <dd>{formatLanguage(doc.language)}</dd>
            </div>
            <div className="meta-chip">
              <dt>Data dokumentu</dt>
              <dd>
                {doc.date ? <time dateTime={doc.date}>{formatDate(doc.date)}</time> : 'Brak danych'}
              </dd>
            </div>
            <div className="meta-chip">
              <dt>Liczba stron</dt>
              <dd>{formatPageCount(doc.pages)}</dd>
            </div>
          </dl>
        </section>

        <Card title="Podsumowanie" icon={<FileTextIcon />} className="dashboard__summary">
          <p className="summary">{result.summary}</p>
        </Card>

        <Card title="Najważniejsze punkty" icon={<ListIcon />}>
          {result.keyPoints.length === 0 ? (
            NO_DATA
          ) : (
            <ul className="checklist">
              {result.keyPoints.map((point, index) => (
                <li key={index}>
                  <span className="checklist__icon" aria-hidden="true">
                    <CheckIcon />
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Daty" icon={<CalendarIcon />}>
          {result.dates.length === 0 ? (
            NO_DATA
          ) : (
            <ol className="timeline">
              {result.dates.map((entry, index) => (
                <li key={index}>
                  <time className="timeline__date" dateTime={entry.date}>
                    {formatDate(entry.date)}
                  </time>
                  <span className="timeline__context">{entry.context}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Podmioty" icon={<UsersIcon />} wide>
          <div className="entities">
            <div>
              <h4 className="entities__title">Organizacje</h4>
              {entities.organizations.length === 0 ? (
                NO_DATA
              ) : (
                <ul className="entity-list">
                  {entities.organizations.map((name, index) => (
                    <li key={index}>
                      <span className="avatar" aria-hidden="true">
                        <BuildingIcon />
                      </span>
                      {keepLegalSuffixTogether(name)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="entities__title">Osoby</h4>
              {entities.people.length === 0 ? (
                NO_DATA
              ) : (
                <ul className="entity-list entity-list--people">
                  {entities.people.map((name, index) => (
                    <li key={index}>
                      <span className="avatar" aria-hidden="true">
                        {initials(name)}
                      </span>
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card title="Kwoty" icon={<CoinsIcon />} wide>
          {result.amounts.length === 0 ? (
            NO_DATA
          ) : (
            <ul className="amounts">
              {result.amounts.map((amount, index) => (
                <li key={index} className="amount">
                  <span className="amount__value">
                    {formatAmountValue(amount.value)}
                    <span className="badge">{amount.currency}</span>
                  </span>
                  <span className="amount__context">{amount.context}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Słowa kluczowe" icon={<TagIcon />} wide>
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
        </Card>

        <JsonPanel result={result} pdfFileName={analysis.fileName} />
      </div>

      {meta && <MetaLine meta={meta} />}
    </div>
  );
}
