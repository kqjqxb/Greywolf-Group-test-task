/** Shown in the idle state: what the app does, in three steps. */
const STEPS = [
  'Wgraj plik PDF (umowę, fakturę, ofertę, raport).',
  'Tekst zostanie odczytany w przeglądarce i przeanalizowany przez AI.',
  'Zobacz podsumowanie i dane, pobierz wynik jako JSON.',
] as const;

export function EmptyState() {
  return (
    <ol className="steps" aria-label="Jak to działa">
      {STEPS.map((text, index) => (
        <li key={text} className="steps__item">
          <span className="steps__number" aria-hidden="true">
            {index + 1}
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}
