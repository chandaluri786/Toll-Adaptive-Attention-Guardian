// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Provides: Clock, PostureSource, Governor. Consumes (via get()): UsageFeed, Planner, Quests.
import type { GetServices } from '../contracts';
import { createClock, type Timers } from './clock';
import { createFakeEngine } from './fakes';
import type { FreeTime } from './freeTime';
import { createMemoryKV } from './kv';
import { createRealEngine as createRealEngineWith, type RealEngineDeps } from './real';
import type { WeatherConfigStore } from './weatherConfig';

/** Flip to true at integration step 1, once C1–C4 are done. */
export const USE_REAL = true;

/** The fake has no weather thresholds or free-time store; C's Settings and demo panel fall back when missing. */
export type EngineModule = ReturnType<typeof createFakeEngine> & {
  debug: { weather?: WeatherConfigStore; freeTime?: FreeTime };
};

export function createEngine(get: GetServices): EngineModule {
  if (USE_REAL) return createRealEngine(get);
  return createFakeEngine();
}

const isJest = () => typeof process !== 'undefined' && process.env?.JEST_WORKER_ID != null;

/** jest: memory storage, and a 60-s interval that never keeps the test process alive. */
const unrefTimers: Timers = {
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms) as unknown as { unref?: () => void };
    h.unref?.();
    return h;
  },
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

function engineDeps(): RealEngineDeps {
  if (isJest()) return { kv: createMemoryKV(), clock: createClock({ timers: unrefTimers }) };
  // MMKV loaded only here, so the fake path and jest never pull in the native module.
  return { kv: (require('./mmkv') as typeof import('./mmkv')).createEngineMMKV() };
}

function createRealEngine(get: GetServices): EngineModule {
  return createRealEngineWith(get, engineDeps());
}
