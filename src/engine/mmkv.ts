// OWNER: C (session 5). The engine's KV port on the phone: react-native-mmkv, keys under `engine:`.
// Only ./index.ts loads this (lazily, never in jest); pure code and tests use ./kv's memory KV.
import { createMMKV } from 'react-native-mmkv';
import { ENGINE_PREFIX, type KV } from './kv';

export function createEngineMMKV(): KV {
  const mmkv = createMMKV({ id: 'toll' });
  return {
    getString: (key) => mmkv.getString(ENGINE_PREFIX + key),
    set: (key, value) => mmkv.set(ENGINE_PREFIX + key, value),
    remove: (key) => {
      mmkv.remove(ENGINE_PREFIX + key);
    },
    keys: () => mmkv.getAllKeys().filter((k) => k.startsWith(ENGINE_PREFIX)),
  };
}
