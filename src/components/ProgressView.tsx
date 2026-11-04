import { useEffect, useState } from 'react';

interface ProgressViewProps {
  step: 'reading' | 'analyzing';
  fileName: string;
  startedAt: number;
}

const STEPS = {
  reading: { number: 1, label: 'Odczytywanie tekstu z pliku PDF…' },
  analyzing: { number: 2, label: 'Analiza treści przez AI…' },
} as const;

/** Seconds since `startedAt`, refreshed every second. */
function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** F-06 loading state: current step and elapsed time. */
export function ProgressView({ step, fileName, startedAt }: ProgressViewProps) {
  const elapsed = useElapsedSeconds(startedAt);
  const current = STEPS[step];

  return (
    <section className="card progress" aria-labelledby="progress-title" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <div>
        <h2 id="progress-title" className="progress__title">
          {current.label}
        </h2>
        <p className="progress__meta">
          Krok {current.number} z 2 · <span className="progress__file">{fileName}</span>
        </p>
        <p className="progress__meta">
          Czas: {elapsed} s{step === 'analyzing' && ' (zwykle do 30 s)'}
        </p>
      </div>
    </section>
  );
}
