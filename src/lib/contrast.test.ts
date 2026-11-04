/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest replaces CSS imports (even `?raw`) with an empty string.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/**
 * WCAG AA contrast of every colour pair the UI uses, in both themes. The colours are read from
 * the real stylesheet (`--name: light-dark(#light, #dark)`), so changing a token re-checks it.
 * Text needs 4.5:1; UI boundaries and the focus ring need 3:1 (WCAG 1.4.11).
 */

type Theme = 'light' | 'dark';

function readTokens(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  const pattern = /--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;
  for (const [, name, light, dark] of css.matchAll(pattern)) {
    if (name && light && dark) {
      tokens.set(name, theme === 'light' ? light : dark);
    }
  }
  return tokens;
}

/** Relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const TEXT = 4.5;
const UI = 3;

/** [foreground token, background token, minimum ratio, where it is used] */
const PAIRS: readonly [string, string, number, string][] = [
  ['color-text', 'color-bg', TEXT, 'body text on page'],
  ['color-text', 'color-surface', TEXT, 'text in cards'],
  ['color-muted', 'color-bg', TEXT, 'muted text on page (footer, lead)'],
  ['color-muted', 'color-surface', TEXT, 'muted text in cards, history details'],
  ['color-primary', 'color-surface', TEXT, 'title, secondary button, links, history name'],
  ['color-primary', 'color-bg', TEXT, 'eyebrow on page'],
  ['color-primary', 'color-primary-soft', TEXT, 'secondary button hover, step numbers'],
  ['color-on-primary', 'color-primary', TEXT, 'primary button, checked theme option'],
  ['color-on-primary', 'color-primary-hover', TEXT, 'primary button hover'],
  ['color-text', 'color-primary-soft', TEXT, 'theme option hover'],
  ['color-muted', 'color-primary-soft', TEXT, 'history details on row hover'],
  ['color-info-text', 'color-primary-soft', TEXT, 'info notice, keyword chips'],
  ['color-warning-text', 'color-warning-soft', TEXT, 'warning notice'],
  ['color-error', 'color-error-soft', TEXT, 'error card title'],
  ['color-text', 'color-error-soft', TEXT, 'error card text'],
  ['color-code-text', 'color-code-bg', TEXT, 'JSON preview'],
  ['color-primary', 'color-surface', UI, 'button borders'],
  ['color-primary', 'color-error-soft', UI, 'button borders in error card'],
  ['color-border-strong', 'color-surface', UI, 'drop zone, theme toggle border'],
  ['color-border-strong', 'color-bg', UI, 'drop zone border on page'],
  ['color-focus', 'color-bg', UI, 'focus ring on page'],
  ['color-focus', 'color-surface', UI, 'focus ring in cards / header'],
  ['color-focus', 'color-error-soft', UI, 'focus ring in error card'],
  ['color-primary', 'color-primary-soft', UI, 'info notice border, spinner'],
  ['color-warning-border', 'color-warning-soft', UI, 'warning notice border'],
];

describe.each<Theme>(['light', 'dark'])('WCAG AA contrast, %s theme', (theme) => {
  const tokens = readTokens(theme);

  it.each(PAIRS)('%s on %s ≥ %s (%s)', (fg, bg, min) => {
    const foreground = tokens.get(fg);
    const background = tokens.get(bg);
    expect(foreground, `--${fg} missing`).toBeDefined();
    expect(background, `--${bg} missing`).toBeDefined();
    expect(contrastRatio(foreground ?? '', background ?? '')).toBeGreaterThanOrEqual(min);
  });
});
