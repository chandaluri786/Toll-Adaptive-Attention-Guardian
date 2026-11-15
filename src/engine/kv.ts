// OWNER: C. A tiny key-value port so engine logic never touches native storage directly.
// Every key C's engine writes lives under `engine:` (one prefix per folder). Same shape as B's
// port in src/day/kv.ts — copied, not imported (C never imports src/day).

export const ENGINE_PREFIX = 'engine:';

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
    getString: (key) => data.get(ENGINE_PREFIX + key),
    set: (key, value) => {
      data.set(ENGINE_PREFIX + key, value);
    },
    remove: (key) => {
      data.delete(ENGINE_PREFIX + key);
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
