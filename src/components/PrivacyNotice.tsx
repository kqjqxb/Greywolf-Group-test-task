/** Required by the brief: the user must know the document goes to an external AI API. */
export function PrivacyNotice() {
  return (
    <div className="notice notice--info">
      <p>
        <strong>Uwaga:</strong> tekst odczytany z pliku zostanie wysłany do zewnętrznej usługi AI
        (Anthropic Claude, a awaryjnie Google Gemini). Wynik analizy — nie sam dokument — jest
        przechowywany na serwerze do 14 dni, aby ten sam plik nie był analizowany ponownie.
      </p>
      <p>Nie wgrywaj dokumentów poufnych ani zawierających dane osobowe.</p>
    </div>
  );
}
