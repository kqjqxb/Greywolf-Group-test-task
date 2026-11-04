import type { HistoryStorage } from './history';

/**
 * Light/dark theme (Stage 6). "system" follows the OS setting (`prefers-color-scheme`) purely in
 * CSS, so it needs no JavaScript and no listener. "light"/"dark" are a user override, set as
 * `data-theme` on <html> and remembered in localStorage. Colours live in src/index.css.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'pdf-insight:theme:v1';

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
  { value: 'system', label: 'Systemowy' },
];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** The saved choice; "system" when nothing (or something unexpected) is saved. */
export function loadThemePreference(storage: HistoryStorage | null): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(storage: HistoryStorage | null, theme: ThemePreference): void {
  try {
    if (theme === 'system') {
      storage?.removeItem(THEME_STORAGE_KEY);
    } else {
      storage?.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage blocked: the choice works until the page is reloaded.
  }
}

/** "system" removes the attribute, so the CSS media query decides. */
export function applyThemePreference(root: HTMLElement, theme: ThemePreference): void {
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
