// OWNER: C (task C6). The demo panel's actions as plain functions over every folder's `debug`, so
// they are tested without React and work the same on fakes and on the real engine and ledger.
// Optional controls (release a forced weather, scrolling, quick opens) are feature-detected.
import type { Debug, Posture, PostureState, Seed } from '../contracts';
import { MIN } from '../shared/emitter';
import { DAY_START_MIN, dayKey } from './time';

export type DemoClock = {
  now(): number;
  setNow(t: number): void;
  setSpeed(x: number): void;
  speed(): number;
  tick(): void;
  resetNow(): void;
};

export type DemoPostureSource = {
  get(): PostureState;
  setPosture(p: Posture): void;
  setGrace(on: boolean): void;
  setAllowance(min: number): void;
};

/** The slice of `debug` (src/services.ts) the panel drives. */
export type DemoDebugs = {
  engine: Debug & { clock: DemoClock; postureSource: DemoPostureSource; weather?: { reset(): void } };
  ledger: Debug & { setBalance(min: number): void };
  device: Debug & { simulateScrolling?(on: boolean): void; emitIntercept?(pkg?: string): void };
  day: Debug & { addSteps(n: number): void };
};

/** Speeds offered. At 60× a 3½-minute weather change takes about 4 seconds. */
export const SPEEDS = [1, 10, 60] as const;
export const QUICK_OPENS = 5;
export const FULL_FREE_TIME_MIN = 120;
export const DEMO_UMBRELLA_MIN = 30;

/** Seeds that also set the time of day, so the real engine's score agrees with the seed. */
export const SEED_TIME: Partial<Record<Seed, number>> = {
  demo_2pm: 14 * 60,
  late_night: 23 * 60 + 30,
};

/**
 * The timestamp at local minute-of-day `minOfDay` on the same Toll day as `now` (days start at
 * 04:00, so 02:00 belongs to the next calendar date). Built from the calendar, never UTC.
 */
export function atLocalTime(now: number, minOfDay: number): number {
  const [y, m, d] = dayKey(now).split('-').map(Number);
  const nextDate = minOfDay < DAY_START_MIN ? 1 : 0;
  return new Date(y, m - 1, d + nextDate, Math.floor(minOfDay / 60), minOfDay % 60, 0, 0).getTime();
}

/** Move the clock forward by whole minutes (one tick follows from setNow). */
export function advance(clock: DemoClock, minutes: number): void {
  clock.setNow(clock.now() + minutes * MIN);
}

export type DemoCapabilities = {
  /** Real engine: setPosture(null) hands the weather back to the score. */
  canRelease: boolean;
  canScroll: boolean;
  canQuickOpen: boolean;
};

export function capabilitiesOf(d: DemoDebugs): DemoCapabilities {
  return {
    canRelease: 'enforced' in d.engine.postureSource,
    canScroll: typeof d.device.simulateScrolling === 'function',
    canQuickOpen: typeof d.device.emitIntercept === 'function',
  };
}

/** Force a weather, or (real engine only) `null` = back to the forecast. Returns false when unsupported. */
export function forceWeather(d: DemoDebugs, p: Posture | null): boolean {
  const ps = d.engine.postureSource;
  if (p !== null) {
    ps.setPosture(p);
    return true;
  }
  if (!capabilitiesOf(d).canRelease) return false;
  (ps.setPosture as (p: Posture | null) => void)(null);
  return true;
}

export function setFreeTimeLeft(d: DemoDebugs, min: number): void {
  d.engine.postureSource.setAllowance(Math.min(Math.max(Math.round(min), 0), FULL_FREE_TIME_MIN));
}

export function quickOpens(d: DemoDebugs, n = QUICK_OPENS): boolean {
  if (!d.device.emitIntercept) return false;
  for (let i = 0; i < n; i++) d.device.emitIntercept();
  return true;
}

const seedFolders = (d: DemoDebugs, s: Seed) => {
  d.engine.seed(s);
  d.ledger.seed(s);
  d.device.seed(s);
  d.day.seed(s);
};

/** Seed every folder at once. Time comes first so B's plan and C's score read the seeded hour. */
export function applySeed(d: DemoDebugs, s: Seed): void {
  const { clock } = d.engine;
  clock.setSpeed(1);
  const minOfDay = SEED_TIME[s];
  if (minOfDay !== undefined) clock.setNow(atLocalTime(clock.now(), minOfDay));
  seedFolders(d, s);
}

/** Back to a fresh day at real time: clock, every folder, forced weather and the thresholds. */
export function resetEverything(d: DemoDebugs): void {
  d.engine.clock.resetNow();
  d.engine.weather?.reset();
  seedFolders(d, 'fresh');
}
