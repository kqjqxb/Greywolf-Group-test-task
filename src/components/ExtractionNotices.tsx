import type { ExtractionFindings } from '../lib/analysisState';
import { emptyPagesText, ocrLimitText, ocrPagesText } from '../lib/emptyPagesText';
import { MAX_OCR_PAGES } from '../lib/pdfText';
import { InjectionNotice } from './InjectionNotice';

interface ExtractionNoticesProps {
  findings: ExtractionFindings;
}

/**
 * What the browser noticed while reading the PDF: pages read with OCR (may contain recognition
 * errors), pages still without text (result may be incomplete), and possible prompt injection.
 */
export function ExtractionNotices({ findings }: ExtractionNoticesProps) {
  const ocr = ocrPagesText(findings.ocrPages);
  const empty = emptyPagesText(findings.emptyPages);
  return (
    <>
      {ocr && (
        <p className="notice notice--info">
          <strong>{ocr.lead}</strong> {ocr.detail}
        </p>
      )}
      {empty && (
        <p className="notice notice--warning">
          <strong>{empty.lead}</strong> {empty.detail}
          {findings.ocrLimitReached && ` ${ocrLimitText(MAX_OCR_PAGES)}`}
        </p>
      )}
      {findings.injectionSuspected && <InjectionNotice />}
    </>
  );
}
