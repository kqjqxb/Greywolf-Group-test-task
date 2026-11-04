import { useEffect, useRef } from 'react';
import { errorMessage, type AppErrorCode } from '../lib/errors';

interface ErrorViewProps {
  code: AppErrorCode;
  /** Shown only when re-running the same file can help. */
  onRetry: (() => void) | null;
  onPickAnother: () => void;
}

/** F-06 error state: Polish message, retry with the same file, or pick another one. */
export function ErrorView({ code, onRetry, onPickAnother }: ErrorViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus here so keyboard and screen reader users land on the message and its buttons.
  useEffect(() => {
    headingRef.current?.focus();
  }, [code]);

  return (
    <section className="card card--error" aria-labelledby="error-title">
      <h2 id="error-title" ref={headingRef} tabIndex={-1} className="card__title">
        Nie udało się przeanalizować pliku
      </h2>
      <p>{errorMessage(code)}</p>
      <div className="actions">
        {onRetry && (
          <button type="button" className="button button--primary" onClick={onRetry}>
            Spróbuj ponownie
          </button>
        )}
        <button
          type="button"
          className={`button ${onRetry ? 'button--secondary' : 'button--primary'}`}
          onClick={onPickAnother}
        >
          Wybierz inny plik
        </button>
      </div>
    </section>
  );
}
