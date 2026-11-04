interface EmptyPagesWarningProps {
  pages: number[];
}

/** Some pages had no text layer (e.g. a scanned annex), so the result may be incomplete. */
export function EmptyPagesWarning({ pages }: EmptyPagesWarningProps) {
  if (pages.length === 0) {
    return null;
  }
  const label = pages.length === 1 ? 'Strona' : 'Strony';
  const verb = pages.length === 1 ? 'nie zawiera' : 'nie zawierają';
  return (
    <p className="notice notice--warning">
      <strong>
        {label} {pages.join(', ')} {verb} tekstu
      </strong>{' '}
      (prawdopodobnie to skany). Ich treść nie została przeanalizowana, więc wynik może być
      niepełny.
    </p>
  );
}
