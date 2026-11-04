import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { browserStorage } from '../lib/history';
import {
  applyThemeChoice,
  loadThemeChoice,
  oppositeTheme,
  resolveTheme,
  revealRadius,
  saveThemeChoice,
  type Theme,
} from '../lib/theme';
import { MoonIcon, SunIcon } from './icons';

const storage = browserStorage();
const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REVEAL_MS = 400;

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * One icon button that switches light ↔ dark. The first visit follows the OS (pure CSS, see
 * lib/theme.ts); a click stores an explicit choice. `aria-pressed` = the dark theme is on.
 * The saved choice is first applied in main.tsx, before React renders; here we only update it.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Theme | null>(() => loadThemeChoice(storage));
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const theme = resolveTheme(choice, prefersDark);

  // Without an explicit choice the OS setting may change while the page is open.
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setPrefersDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const next = oppositeTheme(theme);
    const apply = () => {
      // flushSync: the new icon must be in the DOM before the View Transition snapshots it.
      flushSync(() => setChoice(next));
      applyThemeChoice(document.documentElement, next);
      saveThemeChoice(storage, next);
    };

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }

    // The circle grows from the button centre (a keyboard "click" has no pointer position).
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = revealRadius(x, y, window.innerWidth, window.innerHeight);
    const transition = document.startViewTransition(apply);
    // Web Animations API, not an inline style attribute: allowed by the strict CSP.
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: REVEAL_MS,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // Transition skipped (e.g. tab hidden): the theme is already applied.
      });
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="icon-button no-print"
      aria-label="Przełącz motyw (jasny/ciemny)"
      aria-pressed={isDark}
      title={isDark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      onClick={handleClick}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
