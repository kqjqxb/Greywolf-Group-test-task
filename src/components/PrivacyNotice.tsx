/** Required by the brief: the user must know the document goes to an external AI API. */
export function PrivacyNotice() {
  return (
    <p className="notice notice--info">
      <strong>Uwaga:</strong> tekst odczytany z pliku zostanie wysłany do zewnętrznej usługi AI
      (Google Gemini) w celu analizy. Nie wgrywaj dokumentów poufnych ani zawierających dane
      osobowe.
    </p>
  );
}
