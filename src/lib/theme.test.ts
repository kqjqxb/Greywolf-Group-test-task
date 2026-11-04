import { describe, expect, it } from 'vitest';
import type { HistoryStorage } from './history';
import {
  loadThemeChoice,
  oppositeTheme,
  resolveTheme,
  revealRadius,
  saveThemeChoice,
  THEME_STORAGE_KEY,
} from './theme';

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: HistoryStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { items, storage };
}

const blockedStorage: HistoryStorage = {
  getItem: () => {
    throw new DOMException('Access denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('Access denied', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('Access denied', 'SecurityError');
  },
};

describe('theme choice', () => {
  it('has no explicit choice on the first visit (follow the OS)', () => {
    expect(loadThemeChoice(fakeStorage().storage)).toBeNull();
    expect(loadThemeChoice(null)).toBeNull();
    expect(loadThemeChoice(blockedStorage)).toBeNull();
  });

  it('treats the old "system" value and unexpected values as no choice', () => {
    expect(loadThemeChoice(fakeStorage({ [THEME_STORAGE_KEY]: 'system' }).storage)).toBeNull();
    expect(loadThemeChoice(fakeStorage({ [THEME_STORAGE_KEY]: 'neon' }).storage)).toBeNull();
  });

  it('saves and loads an explicit choice', () => {
    const { items, storage } = fakeStorage();
    saveThemeChoice(storage, 'dark');
    expect(loadThemeChoice(storage)).toBe('dark');
    saveThemeChoice(storage, 'light');
    expect(items.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('never throws when storage is blocked', () => {
    expect(() => saveThemeChoice(blockedStorage, 'dark')).not.toThrow();
  });
});

describe('resolveTheme / oppositeTheme', () => {
  it('uses the explicit choice over the OS setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS setting without a choice', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('toggles between light and dark', () => {
    expect(oppositeTheme('light')).toBe('dark');
    expect(oppositeTheme('dark')).toBe('light');
  });
});

describe('revealRadius', () => {
  it('reaches the farthest viewport corner', () => {
    // Button in the top-right corner of a 1280×800 viewport: farthest corner is bottom-left.
    expect(revealRadius(1240, 32, 1280, 800)).toBeCloseTo(Math.hypot(1240, 768));
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
  });
});
