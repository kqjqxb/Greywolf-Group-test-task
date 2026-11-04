/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest replaces CSS imports (even `?raw`) with an empty string.
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

/**
 * WCAG AA contrast of every colour pair the UI uses, in both themes. The colours are read from
 * the real stylesheet (`--name: light-dark(#light, #dark)`), so changing a token re-checks it.
 * Text needs 4.5:1; large text (the hero keyword), UI boundaries and the focus ring need 3:1.
 *
 * Translucent layers (`light-dark(rgb(r g b / a), …)`) are composited like the browser does:
 * - "page" is --bg alone and --bg under each background blob at its strongest point;
 * - "glass" is the opaque --surface fallback and --surface-glass over every "page" variant,
 *   so text on glass is checked on every backdrop it can get.
 */

type Theme = 'light' | 'dark';
type Rgb = [number, number, number];
interface Rgba {
  rgb: Rgb;
  alpha: number;
}
type Pair = readonly [fg: string, bg: string, min: number, usage: string];

function hexToRgb(hex: string): Rgb {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

function readHexTokens(theme: Theme): Map<string, Rgb> {
  const tokens = new Map<string, Rgb>();
  const pattern = /--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;
  for (const [, name, light, dark] of css.matchAll(pattern)) {
    if (name && light && dark) {
      tokens.set(name, hexToRgb(theme === 'light' ? light : dark));
    }
  }
  return tokens;
}

function readRgbaTokens(theme: Theme): Map<string, Rgba> {
  const tokens = new Map<string, Rgba>();
  const rgba = String.raw`rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)`;
  const pattern = new RegExp(String.raw`--([\w-]+):\s*light-dark\(${rgba},\s*${rgba}\)`, 'g');
  for (const match of css.matchAll(pattern)) {
    const values = match.slice(2, 10).map(Number);
    const [r = 0, g = 0, b = 0, alpha = 1] =
      theme === 'light' ? values.slice(0, 4) : values.slice(4);
    if (match[1] !== undefined) {
      tokens.set(match[1], { rgb: [r, g, b], alpha });
    }
  }
  return tokens;
}

/** Source-over compositing in sRGB, as browsers paint a translucent colour. */
function composite(top: Rgba, bottom: Rgb): Rgb {
  const mix = (i: 0 | 1 | 2) => top.rgb[i] * top.alpha + bottom[i] * (1 - top.alpha);
  return [mix(0), mix(1), mix(2)];
}

/** Relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function luminance(rgb: Rgb): number {
  const [r = 0, g = 0, b = 0] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5;
const LARGE = 3;
const UI = 3;
const BLOBS = ['blob-indigo', 'blob-lavender', 'blob-peach'] as const;

function required<T>(map: Map<string, T>, name: string): T {
  const value = map.get(name);
  if (value === undefined) {
    throw new Error(`--${name} missing in tokens.css`);
  }
  return value;
}

/** Every colour a background name stands for: "page", "glass", or a single token. */
function backgrounds(theme: Theme): Map<string, Map<string, Rgb>> {
  const hex = readHexTokens(theme);
  const rgba = readRgbaTokens(theme);
  const bg = required(hex, 'bg');
  const page = new Map<string, Rgb>([['bg', bg]]);
  for (const blob of BLOBS) {
    page.set(`bg + ${blob}`, composite(required(rgba, blob), bg));
  }
  const glassLayer = required(rgba, 'surface-glass');
  const glass = new Map<string, Rgb>([['surface (opaque fallback)', required(hex, 'surface')]]);
  for (const [name, color] of page) {
    glass.set(`glass over ${name}`, composite(glassLayer, color));
  }
  const result = new Map<string, Map<string, Rgb>>([
    ['page', page],
    ['glass', glass],
  ]);
  for (const [name, color] of hex) {
    result.set(name, new Map([[name, color]]));
  }
  return result;
}

const COMMON_PAIRS: readonly Pair[] = [
  // Body text
  ['text', 'page', TEXT, 'hero title, footer'],
  ['text', 'glass', TEXT, 'text in cards, drop zone, header'],
  ['text', 'surface-raised', TEXT, 'hover surfaces'],
  ['text', 'primary-soft', TEXT, 'step chips, keyword pills, chips'],
  ['text', 'error-soft', TEXT, 'error card text'],
  ['muted', 'page', TEXT, 'hero subtitle, privacy row, meta line'],
  ['muted', 'glass', TEXT, 'secondary text in cards'],
  ['muted', 'surface-raised', TEXT, 'history details on hover'],
  ['muted', 'primary-soft', TEXT, 'meta chip labels'],
  // Brand colour as text
  ['primary', 'page', TEXT, 'links, step numbers on page'],
  ['primary', 'glass', TEXT, 'secondary buttons, eyebrow, JSON summary'],
  ['primary', 'surface-raised', TEXT, 'secondary button hover'],
  ['primary', 'primary-soft', TEXT, 'step numbers, type badge, currency badge'],
  ['on-primary', 'primary', TEXT, 'primary button'],
  ['on-primary', 'primary-hover', TEXT, 'primary button hover'],
  // Semantic colours
  ['info-text', 'primary-soft', TEXT, 'info notice'],
  ['warning-text', 'warning-soft', TEXT, 'warning notice'],
  ['error', 'error-soft', TEXT, 'error card title'],
  ['success', 'success-soft', TEXT, 'key point check icons'],
  ['code-text', 'code-bg', TEXT, 'JSON preview'],
  // Hero keyword gradient stops (≥ 32px bold = large text)
  ['primary', 'page', LARGE, 'hero keyword gradient start'],
  ['accent-lavender', 'page', LARGE, 'hero keyword gradient stop'],
  // UI boundaries and the focus ring (WCAG 1.4.11)
  ['border-strong', 'glass', UI, 'drop zone / theme button border, inside'],
  ['border-strong', 'page', UI, 'drop zone / theme button border, outside'],
  ['primary', 'glass', UI, 'secondary button border, active drop zone'],
  ['primary', 'page', UI, 'active drop zone border, outside'],
  ['primary', 'primary-soft', UI, 'active progress step, timeline dot'],
  ['focus', 'page', UI, 'focus ring on page'],
  ['focus', 'glass', UI, 'focus ring in cards / header'],
  ['focus', 'primary-soft', UI, 'focus ring on tinted chips'],
  ['focus', 'error-soft', UI, 'focus ring in error card'],
  ['error', 'glass', UI, 'error icon'],
  ['warning-border', 'warning-soft', UI, 'warning icon'],
];

/** The dark hero gradient ends on peach (DESIGN.md); in light it ends on lavender. */
const THEME_PAIRS: Record<Theme, readonly Pair[]> = {
  light: [],
  dark: [['accent-peach', 'page', LARGE, 'hero keyword gradient end (dark only)']],
};

describe.each<Theme>(['light', 'dark'])('WCAG AA contrast, %s theme', (theme) => {
  const tokens = readHexTokens(theme);
  const variants = backgrounds(theme);

  it.each([...COMMON_PAIRS, ...THEME_PAIRS[theme]])('%s on %s ≥ %s (%s)', (fg, bg, min) => {
    const foreground = required(tokens, fg);
    const group = required(variants, bg);
    for (const [name, background] of group) {
      const ratio = contrastRatio(foreground, background);
      expect(ratio, `--${fg} on ${name}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
    }
  });
});
