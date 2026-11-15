// OWNER: A (Spec A — Device). See docs/specs/A-device.md.
// Fakes for UsageFeed and DeviceSignals. C builds the score and B builds verifiers against these
// until A flips USE_REAL in ./index.ts at integration step 2.
import type {
  Debug,
  DeviceSignals,
  ForegroundSample,
  GetServices,
  LocationSample,
  Seed,
  UsageFeed,
} from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';
import { createFakeBlocker, createFakeInstalledApps, createFakeNotifier, createFakePermissions } from './fakePorts';
import { createDeviceKit } from './kit';
import { createMemoryStore } from './storage';

export const HOME = { lat: 33.4242, lon: -111.9281 }; // shared with B's fake Planner

export function createFakeDevice(get: GetServices) {
  const samples = createEmitter<ForegroundSample>();
  const intercepts = createEmitter<ForegroundSample>();
  const screen = createEmitter<{ at: number; on: boolean }>();
  const locations = createEmitter<LocationSample>();
  let scrollTimer: ReturnType<typeof setInterval> | null = null;

  const now = () => get().clock.now();

  const usageFeed: UsageFeed = {
    onSample: (fn) => samples.on(fn),
    onIntercept: (fn) => intercepts.on(fn),
  };

  const deviceSignals: DeviceSignals = {
    onScreen: (fn) => screen.on(fn),
    startLocation() {},
    stopLocation() {},
    onLocation: (fn) => locations.on(fn),
  };

  /** Debug controls: the scripted tracks B and C test against. */
  const debug: Debug & {
    simulateScrolling(on: boolean): void;
    emitSample(pkg?: string): void;
    emitIntercept(pkg?: string): void;
    screenOffFor(minutes: number): void;
    walkAway(metres: number, minutes: number, mocked?: boolean): void;
  } = {
    reset() {
      debug.simulateScrolling(false);
    },
    seed(_s: Seed) {
      debug.reset();
    },
    simulateScrolling(on) {
      if (scrollTimer) clearInterval(scrollTimer);
      scrollTimer = on ? setInterval(() => debug.emitSample(), 1000) : null;
    },
    emitSample(pkg = 'com.instagram.android') {
      samples.emit({ at: now(), pkg, appClass: 'restricted' });
    },
    emitIntercept(pkg = 'com.instagram.android') {
      intercepts.emit({ at: now(), pkg, appClass: 'restricted' });
    },
    /** Screen goes off now and back on after `minutes` (timestamps shifted, no waiting). */
    screenOffFor(minutes) {
      const t = now();
      screen.emit({ at: t, on: false });
      screen.emit({ at: t + minutes * MIN, on: true });
    },
    /** One sample per minute, `metres` north of home, for `minutes` minutes. */
    walkAway(metres, minutes, mocked = false) {
      const t = now();
      const dLat = metres / 111_320;
      for (let i = 0; i < minutes; i++) {
        locations.emit({
          at: t + i * MIN,
          lat: HOME.lat + dLat,
          lon: HOME.lon,
          accuracyM: 20,
          mocked,
        });
      }
    },
  };

  // The same kit the real device uses (enforcer, fail-open, notifications, app list), on fake ports.
  const fakeBlocker = createFakeBlocker();
  const fakePermissions = createFakePermissions();
  const fakeNotifier = createFakeNotifier();
  const kit = createDeviceKit(
    {
      blocker: fakeBlocker,
      permissions: fakePermissions,
      installedApps: createFakeInstalledApps(),
      notifier: fakeNotifier,
      store: createMemoryStore(),
    },
    get,
  );

  return {
    services: { usageFeed, deviceSignals },
    debug: Object.assign(debug, { blocker: fakeBlocker, permissions: fakePermissions, notifier: fakeNotifier }),
    kit,
  };
}
