import { describe, expect, it } from 'vitest';
import type { CompletedAnalysis } from './analysisState';
import { sampleResult } from './fixtures/sample-result';
import {
  addToHistory,
  clearHistory,
  HISTORY_STORAGE_KEY,
  loadHistory,
  MAX_HISTORY_ENTRIES,
  removeFromHistory,
  type HistoryStorage,
} from './history';

/** In-memory Web Storage; `quotaBytes` makes setItem throw like a full localStorage. */
class FakeStorage implements HistoryStorage {
  readonly items = new Map<string, string>();

  constructor(private readonly quotaBytes = Infinity) {}

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (value.length > this.quotaBytes) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** Storage that is blocked entirely (e.g. some private modes): every call throws. */
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

function analysis(fileName: string): CompletedAnalysis {
  return {
    fileName,
    result: sampleResult,
    meta: { model: 'claude-haiku-5-5', promptVersion: '1.0.0', durationMs: 4200, cached: false },
    findings: { emptyPages: [], ocrPages: [11], ocrLimitReached: false, injectionSuspected: true },
    analyzedAt: '2026-11-04T12:00:00.000Z',
  };
}

describe('history storage', () => {
  it('saves an analysis and reads it back after a "reload"', () => {
    const storage = new FakeStorage();
    const saved = addToHistory(storage, [], analysis('umowa.pdf'), 'a');
    expect(saved).toHaveLength(1);
    expect(loadHistory(storage)).toEqual([{ ...analysis('umowa.pdf'), id: 'a' }]);
  });

  it('puts the newest first and keeps only the last 10', () => {
    const storage = new FakeStorage();
    let entries = loadHistory(storage);
    for (let i = 1; i <= 12; i++) {
      entries = addToHistory(storage, entries, analysis(`plik-${i}.pdf`), `id-${i}`);
    }
    const loaded = loadHistory(storage);
    expect(loaded).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded[0]?.fileName).toBe('plik-12.pdf');
    expect(loaded.at(-1)?.fileName).toBe('plik-3.pdf');
  });

  it('returns [] for missing, corrupted or non-array data', () => {
    const storage = new FakeStorage();
    expect(loadHistory(storage)).toEqual([]);
    storage.setItem(HISTORY_STORAGE_KEY, '{not json');
    expect(loadHistory(storage)).toEqual([]);
    storage.setItem(HISTORY_STORAGE_KEY, '{"id":"a"}');
    expect(loadHistory(storage)).toEqual([]);
  });

  it('drops entries that do not match the schema and keeps the valid ones', () => {
    const storage = new FakeStorage();
    const valid = { ...analysis('dobry.pdf'), id: 'ok' };
    const badResult = { ...analysis('zly.pdf'), id: 'bad', result: { summary: 'x' } };
    const badDate = { ...analysis('data.pdf'), id: 'date', analyzedAt: 'wczoraj' };
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([badResult, valid, null, badDate, 42]));
    expect(loadHistory(storage)).toEqual([valid]);
  });

  it('drops the oldest entries when the storage quota is exceeded', () => {
    const oneEntrySize = JSON.stringify([{ ...analysis('a.pdf'), id: 'a' }]).length;
    // Room for two entries, not three.
    const storage = new FakeStorage(oneEntrySize * 2 + 10);
    let entries = addToHistory(storage, [], analysis('a.pdf'), 'a');
    entries = addToHistory(storage, entries, analysis('b.pdf'), 'b');
    entries = addToHistory(storage, entries, analysis('c.pdf'), 'c');
    expect(entries.map((entry) => entry.id)).toEqual(['c', 'b']);
    expect(loadHistory(storage).map((entry) => entry.id)).toEqual(['c', 'b']);
  });

  it('never throws when storage is blocked or unavailable', () => {
    expect(loadHistory(blockedStorage)).toEqual([]);
    expect(addToHistory(blockedStorage, [], analysis('a.pdf'), 'a')).toEqual([]);
    expect(removeFromHistory(blockedStorage, [], 'a')).toEqual([]);
    expect(clearHistory(blockedStorage)).toEqual([]);
    expect(loadHistory(null)).toEqual([]);
    expect(addToHistory(null, [], analysis('a.pdf'), 'a')).toHaveLength(1);
  });

  it('removes one entry and clears everything', () => {
    const storage = new FakeStorage();
    let entries = addToHistory(storage, [], analysis('a.pdf'), 'a');
    entries = addToHistory(storage, entries, analysis('b.pdf'), 'b');
    entries = removeFromHistory(storage, entries, 'b');
    expect(loadHistory(storage).map((entry) => entry.id)).toEqual(['a']);
    entries = removeFromHistory(storage, entries, 'a');
    expect(entries).toEqual([]);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();

    addToHistory(storage, [], analysis('c.pdf'), 'c');
    expect(clearHistory(storage)).toEqual([]);
    expect(loadHistory(storage)).toEqual([]);
  });
});
