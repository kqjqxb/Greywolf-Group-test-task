/**
 * Calm, informative notice: the PDF contains text that looks like commands for an AI.
 * Such text is treated as data by the worker prompt, so it did not change the result.
 */
export function InjectionNotice() {
  return (
    <p className="notice notice--info">
      Dokument zawiera tekst wyglądający na polecenia dla AI — zostały zignorowane.
    </p>
  );
}
