// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// Fakes for Clock, PostureSource and Governor. A and B build against these until C flips
// USE_REAL in ./index.ts at integration step 1.
import type { AccessWindow, Clock, Debug, Governor, Posture, PostureSource, PostureState, Seed } from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';

// ---- Clock: real time plus setNow / speed, so the demo panel can move time ----
export function createFakeClock() {
  let anchorReal = Date.now();
  let anchorFake = Date.now();
  let speed = 1;
  const ticks = createEmitter<number>();
  const now = () => anchorFake + (Date.now() - anchorReal) * speed;
  const clock: Clock & {
    setNow(t: number): void;
    setSpeed(x: number): void;
    tick(): void;
  } = {
    now,
    onTick(fn) {
      const unsub = ticks.on(fn);
      return unsub;
    },
    setNow(t) {
      anchorReal = Date.now();
      anchorFake = t;
      ticks.emit(now());
    },
    setSpeed(x) {
      anchorFake = now();
      anchorReal = Date.now();
      speed = x;
    },
    /** Fire one tick by hand (tests, demo panel). Real clock ticks every 60 s. */
    tick() {
      ticks.emit(now());
    },
  };
  return clock;
}

// ---- PostureSource: holds a state; debug buttons change it ----
const REASONS: Record<Posture, string> = {
  open: "Sky's clear. Enjoy it.",
  metered: 'Clouds rolling in — 45 minutes of scrolling in the last hour.',
  sealed: "Storm until 11:00 — you're in Algorithms.",
};

export function createFakePostureSource(clock: Clock) {
  const changes = createEmitter<PostureState>();
  const initial = (): PostureState => ({
    posture: 'open',
    score: 0,
    reason: REASONS.open,
    reasonCode: 'none',
    nextChange: null,
    grace: false,
    allowanceLeftMin: 120,
    computedAt: clock.now(),
  });
  let state = initial();
  const set = (patch: Partial<PostureState>) => {
    state = { ...state, ...patch, computedAt: clock.now() };
    changes.emit(state);
  };
  const source: PostureSource & {
    setPosture(p: Posture): void;
    setGrace(on: boolean): void;
    setAllowance(min: number): void;
    reset(): void;
  } = {
    get: () => state, // stable reference until something changes
    subscribe: (fn) => changes.on(fn),
    setPosture(p) {
      const score = p === 'open' ? 10 : p === 'metered' ? 45 : 75;
      set({ posture: p, score, reason: REASONS[p], reasonCode: p === 'sealed' ? 'schedule' : 'none' });
    },
    setGrace(on) {
      set({ grace: on });
    },
    setAllowance(min) {
      set({ allowanceLeftMin: Math.max(0, min) });
    },
    reset() {
      state = initial();
      changes.emit(state);
    },
  };
  return source;
}

// ---- Governor: one emergency unlock a day ----
export function createFakeGovernor(clock: Clock) {
  let used = false;
  const governor: Governor & { reset(): void } = {
    emergencyUnlock(): AccessWindow | null {
      if (used) return null;
      used = true;
      const at = clock.now();
      return { id: `em-${at}`, scope: 'all', until: at + 15 * MIN, source: 'emergency' };
    },
    emergencyLeftToday: () => (used ? 0 : 1),
    reset() {
      used = false;
    },
  };
  return governor;
}

export function createFakeEngine() {
  const clock = createFakeClock();
  const postureSource = createFakePostureSource(clock);
  const governor = createFakeGovernor(clock);
  const debug: Debug & {
    clock: typeof clock;
    postureSource: typeof postureSource;
    governor: typeof governor;
  } = {
    clock,
    postureSource,
    governor,
    reset() {
      postureSource.reset();
      governor.reset();
    },
    seed(s: Seed) {
      postureSource.reset();
      governor.reset();
      if (s === 'demo_2pm') postureSource.setPosture('sealed');
      if (s === 'late_night') {
        postureSource.setPosture('sealed');
        postureSource.setAllowance(0);
      }
    },
  };
  return { services: { clock, postureSource, governor }, debug };
}
