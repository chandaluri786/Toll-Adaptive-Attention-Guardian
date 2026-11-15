// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Provides: Clock, PostureSource, Governor. Consumes (via get()): UsageFeed, Planner, Quests.
import type { GetServices } from '../contracts';
import { createFakeEngine } from './fakes';

/** Flip to true at integration step 1, once C1–C4 are done. */
export const USE_REAL = false;

export function createEngine(get: GetServices) {
  if (USE_REAL) return createRealEngine(get);
  return createFakeEngine();
}

function createRealEngine(_get: GetServices): ReturnType<typeof createFakeEngine> {
  // C1–C4: real clock (60-s tick, monotonic), scoring + free time, transitions, governor.
  throw new Error('Real engine not implemented yet — tasks C1–C4');
}
