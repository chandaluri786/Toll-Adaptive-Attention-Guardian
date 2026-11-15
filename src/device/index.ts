// OWNER: A (Spec A — Device). See docs/specs/A-device.md.
// Provides: UsageFeed, DeviceSignals. Consumes (via get()): Clock, PostureSource, Ledger, Governor,
// Planner, Quests.
import type { GetServices } from '../contracts';
import { createFakeDevice } from './fakes';

/** Flip to true at integration step 2, once A2, A3 and A9 work on the demo phone. */
export const USE_REAL = false;

export function createDevice(get: GetServices) {
  if (USE_REAL) return createRealDevice(get);
  return createFakeDevice(get);
}

function createRealDevice(_get: GetServices): ReturnType<typeof createFakeDevice> {
  // A2: foreground app feed (expo-app-blocker monitoring). A9: screen + location bridge.
  // See ./native/appBlocker.ts for the blocker wrapper.
  throw new Error('Real device layer not implemented yet — tasks A2, A3, A9');
}
