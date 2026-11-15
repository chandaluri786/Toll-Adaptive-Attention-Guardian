// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Provides: Ledger (balance, spend, credit, windows, history). Consumes (via get()): Clock, PostureSource.
import type { GetServices } from '../contracts';
import { createFakeLedger } from './fakes';
import { createMemoryKV, type KV } from './kv';
import { wireLedger } from './wiring';

/** Flip to true at integration step 1, once C5 is done. */
export const USE_REAL = false;

export function createLedger(get: GetServices) {
  if (USE_REAL) return createRealLedger(get);
  return createFakeLedger(get);
}

const isJest = () => typeof process !== 'undefined' && process.env?.JEST_WORKER_ID != null;

/** MMKV loaded only here, so the fake path and jest never pull in the native module. */
function ledgerKV(): KV {
  if (isJest()) return createMemoryKV();
  return (require('./mmkv') as typeof import('./mmkv')).createLedgerMMKV();
}

function createRealLedger(get: GetServices): ReturnType<typeof createFakeLedger> {
  // C5 real ledger on MMKV (append-only events, 04:00 reset, mint cap, Storm rule, day summaries). C9: sync.
  return wireLedger(get, ledgerKV());
}
