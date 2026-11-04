/** Shown in the idle state: what the app does, in three steps. */
export function EmptyState() {
  return (
    <ol className="steps" aria-label="Jak to działa">
      <li>
        <span className="steps__number" aria-hidden="true">
          1
        </span>
        Wgraj plik PDF (umowę, fakturę, ofertę, raport).
      </li>
      <li>
        <span className="steps__number" aria-hidden="true">
          2
        </span>
        Tekst zostanie odczytany w przeglądarce i przeanalizowany przez AI.
      </li>
      <li>
        <span className="steps__number" aria-hidden="true">
          3
        </span>
        Zobacz podsumowanie i dane, pobierz wynik jako JSON.
      </li>
    </ol>
  );
}
