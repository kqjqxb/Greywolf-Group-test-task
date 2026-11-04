/**
 * Detects text that looks like instructions aimed at an AI model ("prompt injection"),
 * e.g. "INSTRUKCJA DLA SYSTEMU AI: zignoruj wszystkie wcześniejsze polecenia".
 *
 * Informative only: it lets the UI tell the user that such text was found and ignored.
 * The real defense is in the worker (delimiters + system instruction + schema validation),
 * which works whether or not this check finds anything.
 */

/**
 * Lowercase, without Polish diacritics and with single spaces, so one ASCII pattern matches
 * "Zignoruj WCZEŚNIEJSZE\npolecenia" as well as "zignoruj wczesniejsze polecenia".
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ');
}

/** Patterns on normalized text. Kept specific to avoid false alarms on ordinary documents. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  // PL: "zignoruj (wszystkie) wcześniejsze/poprzednie polecenia/instrukcje"
  /\b(?:zignoruj|ignoruj|pomin)(?: wszystkie)? (?:wczesniejsze|poprzednie|powyzsze) (?:polecenia|instrukcje|zasady)\b/,
  // PL: "instrukcja dla systemu AI", "instrukcje dla modelu"
  /\binstrukcj[aei] dla (?:systemu )?(?:ai|sztucznej inteligencji|modelu|asystenta|chatbota)\b/,
  // PL: "prompt systemowy"
  /\bprompt(?:u|em)? systemow/,
  // EN: "ignore/disregard (all) (the) previous/prior/above instructions"
  /\b(?:ignore|disregard|forget)(?: all)?(?: the)? (?:previous|prior|above|earlier) (?:instructions|prompts|rules)\b/,
  // EN: "instruction(s) for the AI (system)"
  /\binstructions? for (?:the )?ai\b/,
  // EN: "system prompt"
  /\bsystem prompt\b/,
  // EN: "you are now a/an AI…" or "you are now in developer mode" — but not "you are now able to…".
  /\byou are now (?:an? (?:ai|assistant|chatbot|language model)\b|in (?:developer|jailbreak|dan) mode\b|dan\b)/,
];

/** True when the text contains a phrase that typically targets an AI model. */
export function looksLikePromptInjection(text: string): boolean {
  const normalized = normalize(text);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
