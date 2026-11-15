// OWNER: C (session 5). The ledger's KV port on the phone: react-native-mmkv, keys under `ledger:`.
// Only ./index.ts loads this (lazily, never in jest); pure code and tests use ./kv's memory KV.
import { createMMKV } from 'react-native-mmkv';
import { LEDGER_PREFIX, type KV } from './kv';

export function createLedgerMMKV(): KV {
  const mmkv = createMMKV({ id: 'toll' });
  return {
    getString: (key) => mmkv.getString(LEDGER_PREFIX + key),
    set: (key, value) => mmkv.set(LEDGER_PREFIX + key, value),
    remove: (key) => {
      mmkv.remove(LEDGER_PREFIX + key);
    },
    keys: () => mmkv.getAllKeys().filter((k) => k.startsWith(LEDGER_PREFIX)),
  };
}
