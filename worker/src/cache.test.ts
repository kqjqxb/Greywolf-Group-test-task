import { describe, expect, it } from 'vitest';
import { sampleResult } from '../../src/lib/fixtures/sample-result';
import {
  CACHE_TTL_SECONDS,
  cacheKey,
  normalizeText,
  readCachedResult,
  writeCachedResult,
} from './cache';
import { FakeKv } from './testing/fakeKv';

describe('cacheKey', () => {
  it('is a SHA-256 hex digest, stable for trivially different text', async () => {
    const key = await cacheKey('Umowa nr 14\r\nStrona 1  \n');
    expect(key).toMatch(/^result:[0-9a-f]{64}$/);
    expect(await cacheKey('Umowa nr 14\nStrona 1')).toBe(key);
    expect(await cacheKey('Umowa nr 15\nStrona 1')).not.toBe(key);
  });

  it('normalizes line ends, trailing spaces and Unicode form', () => {
    // "ó" as one code point vs "o" + combining accent.
    expect(normalizeText('  złóty \r\n')).toBe(normalizeText('złóty'));
  });
});

describe('result cache', () => {
  it('stores the result (not the text) with a 14-day TTL and reads it back', async () => {
    const kv = new FakeKv();
    const key = await cacheKey('tekst');

    await writeCachedResult(kv, key, {
      result: sampleResult,
      model: 'claude-haiku-5-5',
      chunks: 1,
    });

    expect(kv.ttls.get(key)).toBe(CACHE_TTL_SECONDS);
    expect(CACHE_TTL_SECONDS).toBe(14 * 24 * 60 * 60);
    expect(await readCachedResult(kv, key)).toEqual({
      result: sampleResult,
      model: 'claude-haiku-5-5',
      chunks: 1,
    });
  });

  it('treats a missing, corrupted or unreadable entry as a miss', async () => {
    const kv = new FakeKv();
    expect(await readCachedResult(kv, 'result:none')).toBeNull();

    kv.data.set('result:bad', '{"result": {"summary": 1}}');
    expect(await readCachedResult(kv, 'result:bad')).toBeNull();

    kv.failing = true;
    expect(await readCachedResult(kv, 'result:bad')).toBeNull();
    await expect(
      writeCachedResult(kv, 'result:x', { result: sampleResult, model: 'm', chunks: 1 }),
    ).resolves.toBeUndefined();
  });
});
