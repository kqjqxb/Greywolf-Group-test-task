import { useEffect, useState } from 'react';
import { CheckIcon } from './icons';

interface ProgressViewProps {
  step: 'reading' | 'analyzing';
  /** Page being read with OCR right now (during the reading step), or null. */
  ocrPage: number | null;
  /** Some pages were read with OCR (known once reading is done); adds the OCR step. */
  ocrUsed: boolean;
  fileName: string;
  startedAt: number;
}

type StepId = 'read' | 'ocr' | 'ai';

const STEP_LABELS: Record<StepId, string> = {
  read: 'Odczyt',
  ocr: 'OCR',
  ai: 'Analiza AI',
};

/** Seconds since `startedAt`, refreshed every second. */
function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** Rows of the result skeleton: [wide card?, number of text lines]. */
const SKELETON: readonly [boolean, number][] = [
  [true, 2],
  [true, 3],
  [false, 3],
  [false, 3],
];

/**
 * F-06 loading state: a stepper "Odczyt → OCR (only when needed) → Analiza AI" with the
 * current step, elapsed time, and a skeleton of the result below.
 */
export function ProgressView({ step, ocrPage, ocrUsed, fileName, startedAt }: ProgressViewProps) {
  const elapsed = useElapsedSeconds(startedAt);
  const ocrRunning = step === 'reading' && ocrPage !== null;
  const steps: StepId[] = ocrRunning || ocrUsed ? ['read', 'ocr', 'ai'] : ['read', 'ai'];
  const current: StepId = step === 'analyzing' ? 'ai' : ocrRunning ? 'ocr' : 'read';
  const currentIndex = steps.indexOf(current);

  const label =
    current === 'ai'
      ? 'Analiza treści przez AI…'
      : current === 'ocr'
        ? `Rozpoznawanie tekstu (OCR): strona ${ocrPage}…`
        : 'Odczytywanie tekstu z pliku PDF…';

  return (
    <div className="reveal results">
      <section className="card progress" aria-labelledby="progress-title" aria-busy="true">
        <div className="progress__head">
          <h2 id="progress-title" className="progress__title">
            {label}
          </h2>
          <p className="progress__time">
            {elapsed} s{step === 'analyzing' && ' (zwykle do 30 s)'}
          </p>
        </div>
        <ol className="stepper" aria-label={`Krok ${currentIndex + 1} z ${steps.length}`}>
          {steps.map((id, index) => {
            const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : '';
            return (
              <li
                key={id}
                className={`stepper__step${state ? ` stepper__step--${state}` : ''}`}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span className="stepper__dot" aria-hidden="true">
                  {state === 'done' ? <CheckIcon /> : index + 1}
                </span>
                <span className="stepper__label">{STEP_LABELS[id]}</span>
              </li>
            );
          })}
        </ol>
        <p className="progress__file">Plik: {fileName}</p>
      </section>

      <div className="skeleton" aria-hidden="true">
        {SKELETON.map(([wide, lines], index) => (
          <div key={index} className={`skeleton__card${wide ? ' skeleton__card--wide' : ''}`}>
            <span className="skeleton__line skeleton__line--title" />
            {Array.from({ length: lines }, (_, line) => (
              <span
                key={line}
                className={`skeleton__line${line === lines - 1 ? ' skeleton__line--short' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
