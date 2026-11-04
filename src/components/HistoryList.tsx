import { useRef } from 'react';
import { formatDateTime, formatDocumentType } from '../lib/format';
import type { HistoryEntry } from '../lib/history';

interface HistoryListProps {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** F-09: recent analyses saved in this browser; shown on the empty state. */
export function HistoryList({ entries, onOpen, onRemove, onClear }: HistoryListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  function remove(id: string) {
    onRemove(id);
    // The focused "Usuń" button is gone; move focus to the list heading (if the list remains).
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="card history no-print" aria-labelledby="history-title">
      <div className="history__header">
        <h2 id="history-title" ref={headingRef} tabIndex={-1} className="card__title">
          Ostatnie analizy
        </h2>
        <button type="button" className="button button--secondary button--small" onClick={onClear}>
          Wyczyść historię
        </button>
      </div>
      <p className="muted history__note">
        Historia jest zapisana tylko w tej przeglądarce — nie trafia na serwer i nie jest widoczna
        na innych urządzeniach.
      </p>
      <ul className="history__list">
        {entries.map((entry) => (
          <li key={entry.id} className="history__item">
            <button type="button" className="history__open" onClick={() => onOpen(entry)}>
              <span className="history__name">{entry.fileName}</span>
              <span className="history__details">
                {formatDocumentType(entry.result.document.type)} ·{' '}
                <time dateTime={entry.analyzedAt}>{formatDateTime(entry.analyzedAt)}</time>
              </span>
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              aria-label={`Usuń z historii: ${entry.fileName}`}
              onClick={() => remove(entry.id)}
            >
              Usuń
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
