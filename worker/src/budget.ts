import type { KeyValueStore } from './kv';

/**
 * Daily budget guard for Claude (prepaid credit). Counts Claude API calls per UTC day in KV;
 * once the day's count reaches the limit, requests skip Claude and go straight to Gemini.
 *
 * The limit is APPROXIMATE: KV is eventually consistent (a write can take up to ~60 s to be
 * visible in other locations) and read-modify-write is not atomic, so concurrent requests can
 * overshoot it by a few calls. That is acceptable for a cost guard of ~$0.003 per call.
 */

export const DEFAULT_CLAUDE_DAILY_LIMIT = 150;
/** Counters expire on their own a day after their UTC day ends. */
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

/** `CLAUDE_DAILY_LIMIT` from [vars]; a missing or invalid value falls back to the default. */
export function parseDailyLimit(raw: string | undefined): number {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_CLAUDE_DAILY_LIMIT;
}

/** KV key of the counter for the UTC day of `nowMs`, e.g. "claude-calls:2026-11-04". */
export function budgetKey(nowMs: number): string {
  return `claude-calls:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

async function readCount(store: KeyValueStore, key: string): Promise<number> {
  const value = Number(await store.get(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * True when today's Claude calls plus the calls this request may make (`plannedCalls`, its worst
 * case) stay within the limit. A request that does not fit runs entirely on Gemini, so one long
 * document cannot push the day far over the limit. If KV cannot be read we return false:
 * protecting the prepaid credit is more important than using the better model.
 */
export async function hasClaudeBudget(
  store: KeyValueStore,
  limit: number,
  plannedCalls: number,
  nowMs: number,
): Promise<boolean> {
  try {
    return (await readCount(store, budgetKey(nowMs))) + plannedCalls <= limit;
  } catch {
    return false;
  }
}

/** Adds this request's Claude calls to today's counter (one write per request). Never throws. */
export async function recordClaudeCalls(
  store: KeyValueStore,
  calls: number,
  nowMs: number,
): Promise<void> {
  if (calls <= 0) {
    return;
  }
  const key = budgetKey(nowMs);
  try {
    const count = await readCount(store, key);
    await store.put(key, String(count + calls), { expirationTtl: COUNTER_TTL_SECONDS });
  } catch {
    // Losing one update only makes the approximate limit a little more approximate.
  }
}
