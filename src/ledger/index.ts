// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Provides: Ledger (balance, spend, credit, windows, history). Consumes (via get()): Clock, PostureSource.
import type { GetServices } from '../contracts';
import type { LedgerCloud, PairCode } from './cloud';
import { LEDGER_API_URL } from './cloudConfig';
import { createFakeLedger } from './fakes';
import { createMemoryKV, type KV } from './kv';
import { wireLedger } from './wiring';

/** Flip to true at integration step 1, once C5 is done. */
export const USE_REAL = true;

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

let cloud: LedgerCloud | null = null;

function createRealLedger(get: GetServices): ReturnType<typeof createFakeLedger> {
  // C5 real ledger on MMKV (append-only events, 04:00 reset, mint cap, Storm rule, day summaries).
  // C9: syncs to the cloud ledger (never from jest, so tests stay off the network).
  const wired = wireLedger(get, ledgerKV(), {}, { baseUrl: isJest() ? null : LEDGER_API_URL });
  cloud = wired.cloud;
  return wired;
}

/** C9: this phone's wallet id (minted on first use), or null on the fake ledger. */
export const walletId = (): string | null => cloud?.walletId() ?? null;

/**
 * C9: ask the server for a 6-digit code the laptop (C10 extension) claims to learn this wallet id.
 * Valid 5 minutes, works once. Null when offline or on the fake ledger; say "try again" in weather words.
 */
export const requestPairCode = async (): Promise<PairCode | null> => (cloud ? cloud.requestPairCode() : null);
