import type { ExtractionFindings } from '../lib/analysisState';
import { emptyPagesText, ocrLimitText, ocrPagesText } from '../lib/emptyPagesText';
import { MAX_OCR_PAGES } from '../lib/pdfText';
import { InfoIcon, WarningIcon } from './icons';
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
  if (!ocr && !empty && !findings.injectionSuspected) {
    return null;
  }
  return (
    <div className="notices dashboard__wide">
      {ocr && (
        <div className="notice notice--info">
          <InfoIcon />
          <p>
            <strong>{ocr.lead}</strong> {ocr.detail}
          </p>
        </div>
      )}
      {empty && (
        <div className="notice notice--warning">
          <WarningIcon />
          <p>
            <strong>{empty.lead}</strong> {empty.detail}
            {findings.ocrLimitReached && ` ${ocrLimitText(MAX_OCR_PAGES)}`}
          </p>
        </div>
      )}
      {findings.injectionSuspected && <InjectionNotice />}
    </div>
  );
}
