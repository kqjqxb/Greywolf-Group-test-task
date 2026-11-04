import { describe, expect, it } from 'vitest';
import type { HistoryStorage } from './history';
import { loadThemePreference, saveThemePreference, THEME_STORAGE_KEY } from './theme';

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

describe('theme preference', () => {
  it('defaults to "system"', () => {
    expect(loadThemePreference(fakeStorage().storage)).toBe('system');
    expect(loadThemePreference(null)).toBe('system');
    expect(loadThemePreference(blockedStorage)).toBe('system');
  });

  it('ignores unexpected stored values', () => {
    const { storage } = fakeStorage({ [THEME_STORAGE_KEY]: 'neon' });
    expect(loadThemePreference(storage)).toBe('system');
  });

  it('saves light/dark and removes the key for "system"', () => {
    const { items, storage } = fakeStorage();
    saveThemePreference(storage, 'dark');
    expect(loadThemePreference(storage)).toBe('dark');
    saveThemePreference(storage, 'light');
    expect(items.get(THEME_STORAGE_KEY)).toBe('light');
    saveThemePreference(storage, 'system');
    expect(items.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    expect(() => saveThemePreference(blockedStorage, 'dark')).not.toThrow();
  });
});
