// OWNER: B. A tiny key-value port so planner logic never touches native storage directly.
// Every key B writes lives under the `day:` prefix (house rule: one prefix per folder).
// The MMKV-backed version is in ./store.ts, so tests and pure code never load the native module.

export const DAY_PREFIX = 'day:';

export type KV = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Full stored keys, prefix included (for tests and debugging). */
  keys(): string[];
};

export function createMemoryKV(): KV {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(DAY_PREFIX + key),
    set: (key, value) => {
      data.set(DAY_PREFIX + key, value);
    },
    remove: (key) => {
      data.delete(DAY_PREFIX + key);
    },
    keys: () => [...data.keys()],
  };
}

/** Read and parse JSON, returning undefined for missing or corrupt data (never trust storage). */
export function readJson(kv: KV, key: string): unknown {
  const raw = kv.getString(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
