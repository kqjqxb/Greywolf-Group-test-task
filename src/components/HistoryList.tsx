import { useRef, useState } from 'react';
import { formatDateTime, formatDocumentType } from '../lib/format';
import type { HistoryEntry } from '../lib/history';
import { formatRelativeTime } from './displayFormat';
import { TrashIcon } from './icons';

interface HistoryListProps {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** F-09: recent analyses saved in this browser, as cards on the empty state. */
export function HistoryList({ entries, onOpen, onRemove, onClear }: HistoryListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // "5 minut temu" is computed once per visit of the empty state; no ticking clock needed.
  const [now] = useState(() => Date.now());

  function remove(id: string) {
    onRemove(id);
    // The focused delete button is gone; move focus to the list heading (if the list remains).
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="history no-print" aria-labelledby="history-title">
      <div className="history__header">
        <h2 id="history-title" ref={headingRef} tabIndex={-1} className="history__title">
          Ostatnie analizy
        </h2>
        <button type="button" className="button button--secondary button--small" onClick={onClear}>
          Wyczyść historię
        </button>
      </div>
      <p className="history__note">
        Historia jest zapisana tylko w tej przeglądarce — nie trafia na serwer i nie jest widoczna
        na innych urządzeniach.
      </p>
      <ul className="history__list">
        {entries.map((entry) => {
          const absolute = formatDateTime(entry.analyzedAt);
          return (
            <li key={entry.id} className="history-card">
              <button type="button" className="history-card__open" onClick={() => onOpen(entry)}>
                <span className="history-card__name">{entry.fileName}</span>
                <span className="history-card__meta">
                  <span className="badge">{formatDocumentType(entry.result.document.type)}</span>
                  <time dateTime={entry.analyzedAt} title={absolute}>
                    {formatRelativeTime(entry.analyzedAt, now) ?? absolute}
                  </time>
                </span>
              </button>
              <button
                type="button"
                className="icon-button icon-button--small history-card__delete"
                aria-label={`Usuń z historii: ${entry.fileName}`}
                title="Usuń z historii"
                onClick={() => remove(entry.id)}
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
