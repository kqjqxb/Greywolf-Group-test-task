import { ShieldIcon } from './icons';

/**
 * Required by the brief: the user must know the document goes to an external AI API.
 * A compact row under the drop zone, so it does not compete visually with the upload itself.
 */
export function PrivacyNotice() {
  return (
    <div className="privacy">
      <ShieldIcon />
      <p>
        <strong>Uwaga:</strong> tekst z pliku trafia do zewnętrznej usługi AI (Anthropic Claude,
        awaryjnie Google Gemini). Wynik — nie sam dokument — jest przechowywany na serwerze do 14
        dni, aby ten sam plik nie był analizowany ponownie. Nie wgrywaj dokumentów poufnych ani
        zawierających dane osobowe.
      </p>
    </div>
  );
}
