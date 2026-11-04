import type { HistoryStorage } from './history';

/**
 * Light/dark theme. Until the user clicks the theme button, the page follows the OS setting
 * (`prefers-color-scheme`) purely in CSS: no `data-theme` attribute, nothing saved. A click
 * stores an explicit "light" or "dark" in localStorage and sets `data-theme` on <html>, which
 * overrides the media query. Colours live in src/styles/tokens.css.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pdf-insight:theme:v1';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * The user's explicit choice, or null when there is none (follow the OS). Old saved values such
 * as "system" (from the earlier 3-option control) or anything unexpected also mean null.
 */
export function loadThemeChoice(storage: HistoryStorage | null): Theme | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveThemeChoice(storage: HistoryStorage | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice works until the page is reloaded.
  }
}

/** null removes the attribute, so the CSS media query decides. */
export function applyThemeChoice(root: HTMLElement, choice: Theme | null): void {
  if (choice === null) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

/** The theme on screen: the explicit choice, otherwise the OS setting. */
export function resolveTheme(choice: Theme | null, systemPrefersDark: boolean): Theme {
  return choice ?? (systemPrefersDark ? 'dark' : 'light');
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Radius of the circle that, centred on (x, y), covers the whole viewport: the distance to the
 * farthest corner. Used by the circular theme-switch reveal.
 */
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}
