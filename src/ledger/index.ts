// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Provides: Ledger (balance, spend, credit, windows, history). Consumes (via get()): Clock, PostureSource.
import type { GetServices } from '../contracts';
import { createFakeLedger } from './fakes';

/** Flip to true at integration step 1, once C5 is done. */
export const USE_REAL = false;

export function createLedger(get: GetServices) {
  if (USE_REAL) return createRealLedger(get);
  return createFakeLedger(get);
}

function createRealLedger(_get: GetServices): ReturnType<typeof createFakeLedger> {
  // C5: append-only events, 04:00 reset, mint cap, Storm rule, day summaries. C9: sync.
  throw new Error('Real ledger not implemented yet — task C5');
}
