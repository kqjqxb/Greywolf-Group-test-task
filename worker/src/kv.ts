/**
 * The part of a Workers KV namespace we use. A plain interface, so tests can pass an in-memory
 * fake; the real `KVNamespace` binding (wrangler.toml [[kv_namespaces]]) satisfies it.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
