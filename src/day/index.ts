// OWNER: B (Spec B — Day & quests). See docs/specs/B-day-quests.md.
// Provides: Planner, Quests. Consumes (via get()): Clock, PostureSource, Ledger, DeviceSignals.
import type { GetServices } from '../contracts';
import { createFakeDay } from './fakes';

/** Flip to true at integration step 3, once B1–B3 are done. */
export const USE_REAL = false;

export function createDay(get: GetServices) {
  if (USE_REAL) return createRealDay(get);
  return createFakeDay(get);
}

function createRealDay(_get: GetServices): ReturnType<typeof createFakeDay> {
  // B1: planner store. B2: Plan my day + reminders. B3: quest engine + verifiers (./verifiers).
  throw new Error('Real day module not implemented yet — tasks B1–B3');
}
