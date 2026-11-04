import type { HistoryEntry, HistoryStorage } from './history';

/**
 * Lets the shown result survive a page reload.
 * The result itself is already saved in the history (localStorage, F-09); here we keep only the
 * id of the entry on screen, in sessionStorage: it is per tab and disappears with the tab, so
 * a new tab starts empty. No cookies: they are limited to 4 KB and sent to the server.
 */

export const CURRENT_ANALYSIS_KEY = 'pdf-insight:current:v1';

/** sessionStorage, or null when the browser does not let us touch it (the getter can throw). */
export function browserSessionStorage(): HistoryStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers which history entry is on screen. A failed write only means no restore on reload. */
export function saveCurrentAnalysisId(storage: HistoryStorage | null, id: string): void {
  try {
    storage?.setItem(CURRENT_ANALYSIS_KEY, id);
  } catch {
    // Storage full or blocked: the result is just not restored after a reload.
  }
}

export function clearCurrentAnalysisId(storage: HistoryStorage | null): void {
  try {
    storage?.removeItem(CURRENT_ANALYSIS_KEY);
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}

/** The id of the entry on screen before the reload, or null (nothing saved / storage blocked). */
export function loadCurrentAnalysisId(storage: HistoryStorage | null): string | null {
  try {
    return storage?.getItem(CURRENT_ANALYSIS_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The entry that was on screen before the reload, or null. `history` comes from loadHistory, so
 * it is already validated with Zod: an id that points to a missing or invalid entry gives null.
 */
export function loadCurrentAnalysis(
  storage: HistoryStorage | null,
  history: readonly HistoryEntry[],
): HistoryEntry | null {
  const id = loadCurrentAnalysisId(storage);
  if (id === null) {
    return null;
  }
  return history.find((entry) => entry.id === id) ?? null;
}
