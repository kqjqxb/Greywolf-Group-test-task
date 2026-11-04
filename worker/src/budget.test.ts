import { describe, expect, it } from 'vitest';
import {
  budgetKey,
  DEFAULT_CLAUDE_DAILY_LIMIT,
  hasClaudeBudget,
  parseDailyLimit,
  recordClaudeCalls,
} from './budget';
import { FakeKv } from './testing/fakeKv';

const NOV_4_NOON = Date.UTC(2026, 10, 4, 12, 0, 0);
const NOV_5_EARLY = Date.UTC(2026, 10, 5, 0, 30, 0);

describe('Claude daily budget', () => {
  it('uses one counter per UTC day', () => {
    expect(budgetKey(NOV_4_NOON)).toBe('claude-calls:2026-11-04');
    expect(budgetKey(NOV_5_EARLY)).toBe('claude-calls:2026-11-05');
  });

  it('allows Claude below the limit and blocks it at the limit', async () => {
    const kv = new FakeKv();
    expect(await hasClaudeBudget(kv, 3, NOV_4_NOON)).toBe(true);

    await recordClaudeCalls(kv, 2, NOV_4_NOON);
    expect(await hasClaudeBudget(kv, 3, NOV_4_NOON)).toBe(true);

    await recordClaudeCalls(kv, 1, NOV_4_NOON);
    expect(kv.data.get('claude-calls:2026-11-04')).toBe('3');
    expect(await hasClaudeBudget(kv, 3, NOV_4_NOON)).toBe(false);
    // A new UTC day starts from zero.
    expect(await hasClaudeBudget(kv, 3, NOV_5_EARLY)).toBe(true);
  });

  it('writes counters with a TTL and skips the write when there were no calls', async () => {
    const kv = new FakeKv();
    await recordClaudeCalls(kv, 0, NOV_4_NOON);
    expect(kv.data.size).toBe(0);

    await recordClaudeCalls(kv, 1, NOV_4_NOON);
    expect(kv.ttls.get('claude-calls:2026-11-04')).toBeGreaterThan(24 * 60 * 60);
  });

  it('skips Claude when KV cannot be read, and never throws on a failed write', async () => {
    const kv = new FakeKv();
    kv.failing = true;
    expect(await hasClaudeBudget(kv, 100, NOV_4_NOON)).toBe(false);
    await expect(recordClaudeCalls(kv, 1, NOV_4_NOON)).resolves.toBeUndefined();
  });

  it('parses CLAUDE_DAILY_LIMIT with a safe default', () => {
    expect(parseDailyLimit('20')).toBe(20);
    expect(parseDailyLimit('0')).toBe(0);
    expect(parseDailyLimit(undefined)).toBe(DEFAULT_CLAUDE_DAILY_LIMIT);
    expect(parseDailyLimit('')).toBe(DEFAULT_CLAUDE_DAILY_LIMIT);
    expect(parseDailyLimit('abc')).toBe(DEFAULT_CLAUDE_DAILY_LIMIT);
    expect(parseDailyLimit('-5')).toBe(DEFAULT_CLAUDE_DAILY_LIMIT);
  });
});
