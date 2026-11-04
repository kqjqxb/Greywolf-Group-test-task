import { useState } from 'react';
import { browserStorage } from '../lib/history';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  THEME_OPTIONS,
  type ThemePreference,
} from '../lib/theme';

const storage = browserStorage();

/**
 * "Jasny / Ciemny / Systemowy" as a native radio group: one Tab stop, arrow keys switch the
 * option, and screen readers announce "Motyw, grupa, Jasny, przycisk opcji 1 z 3".
 * The attribute is first set in main.tsx (before React renders); here we only update it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(storage));

  function choose(next: ThemePreference) {
    setTheme(next);
    saveThemePreference(storage, next);
    applyThemePreference(document.documentElement, next);
  }

  return (
    <fieldset className="theme-toggle no-print">
      <legend className="visually-hidden">Motyw</legend>
      {THEME_OPTIONS.map((option) => (
        <label key={option.value} className="theme-toggle__option">
          <input
            type="radio"
            name="theme"
            className="theme-toggle__input"
            value={option.value}
            checked={theme === option.value}
            onChange={() => choose(option.value)}
          />
          <span className="theme-toggle__label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
