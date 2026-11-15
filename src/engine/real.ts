// OWNER: C (session 5). The real engine: clock → signals → score → transitions → PostureState,
// plus free time, the weather thresholds and the emergency governor, all on one injected KV.
// Returns the same shape as createFakeEngine() (services + debug) so the demo panel keeps working.
// `get()` is late-bound: nothing here calls it until the posture source is first used, and that
// first use starts the feeds and the 60-s readings once services are wired.
import type { GetServices, Posture, PostureSource, PostureState, Seed, Unsub } from '../contracts';
import { createEmitter } from '../shared/emitter';
import { createClock, type RealClock } from './clock';
import { createFreeTime } from './freeTime';
import { createGovernor } from './governor';
import type { KV } from './kv';
import { createPostureEngine } from './postureEngine';
import { reasonFor } from './reasons';
import { createSignalsBuilder } from './signals';
import { createWeatherConfig } from './weatherConfig';

/** Scores shown while the demo panel forces a weather (same as the fake). */
export const FORCED_SCORE: Record<Posture, number> = { open: 10, metered: 45, sealed: 75 };
/** Never re-check a grace end sooner than this (real ms). */
export const MIN_SETTLE_DELAY_MS = 250;

export type Timeouts = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type RealEngineDeps = {
  kv: KV;
  clock?: RealClock;
  /** For ending the 90-s advisory on time between readings. */
  timeouts?: Timeouts;
};

/** Demo-panel overrides on top of the computed weather. */
type Force = { posture?: Posture; grace?: boolean };

export type RealPostureSource = PostureSource & {
  /** Force a weather; null hands control back to the score. */
  setPosture(p: Posture | null): void;
  setGrace(on: boolean): void;
  /** Free time left today (0..120). */
  setAllowance(min: number): void;
  /** The weather actually enforced (old weather during the 90-s advisory). */
  enforced(): Posture;
  /** Take one reading now instead of waiting for the tick. */
  read(): PostureState;
  reset(): void;
};

const defaultTimeouts: Timeouts = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createRealEngine(get: GetServices, deps: RealEngineDeps) {
  const { kv, clock = createClock(), timeouts = defaultTimeouts } = deps;
  const freeTime = createFreeTime({ clock, kv });
  const weather = createWeatherConfig({ kv });
  const governor = createGovernor({ clock, kv });
  const changes = createEmitter<PostureState>();
  let force: Force = {};
  let started = false;
  let settleTimer: unknown = null;

  const signals = createSignalsBuilder({ get, clock, freeTime, posture: () => postureSource.enforced() });
  const core = createPostureEngine({ clock, snapshot: () => signals.build(), config: weather, monotonic: clock.monotonic });

  /** The computed state with the demo panel's overrides on top. */
  const overlay = (s: PostureState): PostureState => {
    const allowanceLeftMin = freeTime.leftMin(); // live, so a demo-panel edit shows at once
    if (!force.posture) return { ...s, allowanceLeftMin, grace: force.grace ?? s.grace };
    const snap = signals.build();
    const { reason, reasonCode } = reasonFor({ ...snap, posture: force.posture });
    return {
      ...s,
      posture: force.posture,
      score: FORCED_SCORE[force.posture],
      reason,
      reasonCode,
      nextChange: null,
      grace: force.grace ?? false,
      allowanceLeftMin,
    };
  };

  let view = overlay(core.get());
  const publish = () => {
    view = overlay(core.get());
    changes.emit(view);
    scheduleSettle();
  };

  /** During an advisory, wake up when it ends so enforcement starts on time, not on the next tick. */
  const scheduleSettle = () => {
    if (settleTimer !== null) timeouts.clearTimeout(settleTimer);
    settleTimer = null;
    if (!view.grace || force.grace !== undefined || !view.nextChange) return;
    const delay = Math.max(MIN_SETTLE_DELAY_MS, (view.nextChange.at - clock.now()) / clock.speed());
    settleTimer = timeouts.setTimeout(() => {
      settleTimer = null;
      core.get(); // settles an expired grace and emits
    }, delay);
  };

  core.subscribe(() => publish());

  /** Start feeds and readings on first use, once services are wired (get() is late-bound). */
  const ensureStarted = () => {
    if (started || !get().clock) return;
    started = true;
    signals.start();
    core.start();
  };

  const setForce = (next: Force) => {
    force = next;
    publish();
  };

  const postureSource: RealPostureSource = {
    get() {
      ensureStarted();
      core.get(); // settle lazily (emits through the subscription above when it changes)
      return view;
    },
    subscribe(fn): Unsub {
      ensureStarted();
      return changes.on(fn);
    },
    setPosture: (p) => setForce({ ...force, posture: p ?? undefined }),
    setGrace: (on) => setForce({ ...force, grace: on }),
    setAllowance(min) {
      freeTime.setLeft(min);
      publish();
    },
    enforced() {
      if (force.posture) return force.grace ? core.enforced() : force.posture;
      return core.enforced();
    },
    read() {
      ensureStarted();
      core.read();
      return view;
    },
    reset() {
      force = {};
      freeTime.reset();
      signals.reset();
      core.reset();
    },
  };

  const debug = {
    clock,
    postureSource,
    governor,
    /** Weather thresholds (Settings, C7). Not cleared by reset(): they're the user's settings. */
    weather,
    freeTime,
    reset() {
      postureSource.reset();
      governor.reset();
    },
    seed(s: Seed) {
      debug.reset();
      if (s === 'demo_2pm') postureSource.setPosture('sealed');
      if (s === 'late_night') {
        postureSource.setPosture('sealed');
        postureSource.setAllowance(0);
      }
    },
  };

  return { services: { clock, postureSource, governor }, debug };
}

export type RealEngine = ReturnType<typeof createRealEngine>;
