import type { KeyValueStore } from '../kv';

/** In-memory KV for tests. Records the TTL of every write; `failing` makes every call throw. */
export class FakeKv implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly ttls = new Map<string, number | undefined>();
  failing = false;

  get(key: string): Promise<string | null> {
    if (this.failing) {
      return Promise.reject(new Error('kv down'));
    }
    return Promise.resolve(this.data.get(key) ?? null);
  }

  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('kv down'));
    }
    this.data.set(key, value);
    this.ttls.set(key, options?.expirationTtl);
    return Promise.resolve();
  }
}
