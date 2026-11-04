import { emptyPagesText } from '../lib/emptyPagesText';

interface EmptyPagesWarningProps {
  pages: number[];
}

/** Some pages had no text layer (e.g. a scanned annex), so the result may be incomplete. */
export function EmptyPagesWarning({ pages }: EmptyPagesWarningProps) {
  const text = emptyPagesText(pages);
  if (text === null) {
    return null;
  }
  return (
    <p className="notice notice--warning">
      <strong>{text.lead}</strong> {text.detail}
    </p>
  );
}
