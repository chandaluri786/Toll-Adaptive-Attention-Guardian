// OWNER: A (Spec A — Device). See docs/specs/A-device.md.
// Provides: UsageFeed, DeviceSignals (the contract) + `kit`, everything else A's own screens need.
// Consumes (via get()): Clock, PostureSource, Ledger, Governor, Planner, Quests.
import type { GetServices } from '../contracts';
import { createFakeDevice } from './fakes';

/**
 * Flip to true at integration step 2, once A2, A3 and A9 work on the demo phone.
 * false = everything runs on fakes (tests, the browser preview, and any phone before integration).
 */
export const USE_REAL = true;

/** Jest has no native modules (expo-app-blocker and co.), so tests always run the device on fakes. */
const isJest = () => typeof process !== 'undefined' && process.env?.JEST_WORKER_ID != null;

export function createDevice(get: GetServices) {
  if (USE_REAL && !isJest()) return createRealDeviceLazily(get);
  return createFakeDevice(get);
}

/**
 * The real device imports native modules (expo-app-blocker, expo-location, ...) that exist only in a
 * dev build. Requiring it here, not at the top of the file, keeps Jest and the browser preview from
 * ever loading them.
 */
function createRealDeviceLazily(get: GetServices): ReturnType<typeof createFakeDevice> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRealDevice } = require('./native/real') as typeof import('./native/real');
  return createRealDevice(get) as unknown as ReturnType<typeof createFakeDevice>;
}

export type DeviceModule = ReturnType<typeof createFakeDevice>;
