// OWNER: A (Spec A). Tiny key-value store for everything A persists on the phone.
//
// Why an interface: react-native-mmkv is a native module, so it cannot run in Jest or in the
// browser preview. Everything in src/device depends on `KeyValueStore`; the app picks MMKV on a
// phone and an in-memory map everywhere else. All keys start with `device:` (house rule: each
// folder writes only its own prefix).

export interface KeyValueStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const KEY_PREFIX = 'device:';

/** In-memory store: used by tests, the web preview and the fakes. Lost on reload. */
export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

/** Typed JSON helpers so callers never hand-roll JSON.parse error handling. */
export function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  const raw = store.get(key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback; // corrupted value: start fresh rather than crash the app at launch
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  store.set(key, JSON.stringify(value));
}

/**
 * MMKV-backed store for real devices. Loaded lazily with `require` so importing this file never
 * touches native code (Jest and the web preview import it too). Falls back to memory if MMKV is
 * unavailable, for example in Expo Go.
 */
export function createDeviceStore(): KeyValueStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'toll-device' });
    return {
      get: (key) => mmkv.getString(key),
      set: (key, value) => mmkv.set(key, value),
      remove: (key) => void mmkv.remove(key),
    };
  } catch {
    return createMemoryStore();
  }
}
