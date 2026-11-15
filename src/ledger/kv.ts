// OWNER: C. The ledger's key-value port, so ledger logic never touches native storage directly.
// Every key the ledger writes lives under `ledger:`. Same shape as src/engine/kv.ts — copied,
// not imported (the ledger reaches the engine only through the contract).

export const LEDGER_PREFIX = 'ledger:';

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
    getString: (key) => data.get(LEDGER_PREFIX + key),
    set: (key, value) => {
      data.set(LEDGER_PREFIX + key, value);
    },
    remove: (key) => {
      data.delete(LEDGER_PREFIX + key);
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
