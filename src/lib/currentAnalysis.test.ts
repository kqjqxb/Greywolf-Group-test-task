import { describe, expect, it } from 'vitest';
import { sampleResult } from './fixtures/sample-result';
import {
  clearCurrentAnalysisId,
  CURRENT_ANALYSIS_KEY,
  loadCurrentAnalysis,
  loadCurrentAnalysisId,
  saveCurrentAnalysisId,
} from './currentAnalysis';
import type { HistoryEntry, HistoryStorage } from './history';

class FakeStorage implements HistoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
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

function entry(id: string): HistoryEntry {
  return {
    id,
    fileName: `${id}.pdf`,
    result: sampleResult,
    meta: null,
    findings: { emptyPages: [], ocrPages: [], ocrLimitReached: false, injectionSuspected: false },
    analyzedAt: '2026-11-04T12:00:00.000Z',
  };
}

const history = [entry('a'), entry('b')];

describe('current analysis pointer', () => {
  it('restores the entry whose id was saved', () => {
    const storage = new FakeStorage();
    saveCurrentAnalysisId(storage, 'b');
    expect(storage.items.get(CURRENT_ANALYSIS_KEY)).toBe('b');
    expect(loadCurrentAnalysis(storage, history)).toBe(history[1]);
  });

  it('gives null when nothing is saved or after clearing', () => {
    const storage = new FakeStorage();
    expect(loadCurrentAnalysis(storage, history)).toBeNull();
    saveCurrentAnalysisId(storage, 'a');
    clearCurrentAnalysisId(storage);
    expect(loadCurrentAnalysisId(storage)).toBeNull();
    expect(loadCurrentAnalysis(storage, history)).toBeNull();
  });

  it('gives null when the entry is no longer in the (validated) history', () => {
    const storage = new FakeStorage();
    saveCurrentAnalysisId(storage, 'deleted');
    expect(loadCurrentAnalysis(storage, history)).toBeNull();
    expect(loadCurrentAnalysis(storage, [])).toBeNull();
  });

  it('never throws when storage is blocked or missing', () => {
    expect(() => saveCurrentAnalysisId(blockedStorage, 'a')).not.toThrow();
    expect(() => clearCurrentAnalysisId(blockedStorage)).not.toThrow();
    expect(loadCurrentAnalysis(blockedStorage, history)).toBeNull();
    expect(loadCurrentAnalysis(null, history)).toBeNull();
    expect(() => saveCurrentAnalysisId(null, 'a')).not.toThrow();
  });
});
