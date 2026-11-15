// OWNER: C (task C1). The real Clock: wall time plus setNow / speed for the demo panel, a 60-s
// tick, and a monotonic reading for staleness checks (fail-open must never fire because the
// user changed the time or the demo moved it). Timers and time sources are injected so jest
// never depends on real time. This file is the only place in src/engine allowed to read Date.now().
import type { Clock } from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';

/** One tick per clock minute (contract: "60-s tick"). */
export const TICK_MS = MIN;
/** Fastest the demo panel may run time (1 clock hour per real minute). */
export const MAX_SPEED = 60;

export type Timers = {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

export type ClockDeps = {
  wallNow?: () => number;
  monoNow?: () => number;
  timers?: Timers;
};

export type RealClock = Clock & {
  setNow(t: number): void;
  setSpeed(x: number): void;
  speed(): number;
  /** Fire one tick by hand (tests, demo panel). */
  tick(): void;
  /** Demo panel "Reset everything": back to wall time at normal speed, then one tick. */
  resetNow(): void;
  /** Milliseconds from an arbitrary origin; unaffected by setNow, speed or wall-clock changes. */
  monotonic(): number;
  /** Stop the timer and drop every subscriber. */
  stop(): void;
};

const defaultTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

function defaultMonoNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}

function clampSpeed(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(x, MAX_SPEED);
}

export function createClock(deps: ClockDeps = {}): RealClock {
  const wallNow = deps.wallNow ?? (() => Date.now());
  const monoNow = deps.monoNow ?? defaultMonoNow;
  const timers = deps.timers ?? defaultTimers;
  let ticks = createEmitter<number>();

  let anchorWall = wallNow();
  let anchorClock = anchorWall;
  let speed = 1;
  let handle: unknown = null;

  const now = () => anchorClock + (wallNow() - anchorWall) * speed;
  const reanchor = (clockTime: number) => {
    anchorWall = wallNow();
    anchorClock = clockTime;
  };

  const stopTimer = () => {
    if (handle === null) return;
    timers.clearInterval(handle);
    handle = null;
  };
  const startTimer = () => {
    stopTimer();
    handle = timers.setInterval(() => ticks.emit(now()), TICK_MS / speed);
  };

  return {
    now,
    onTick(fn) {
      const owner = ticks;
      const unsub = owner.on(fn);
      if (handle === null) startTimer();
      return () => {
        unsub();
        if (owner === ticks && ticks.size() === 0) stopTimer();
      };
    },
    setNow(t) {
      if (!Number.isFinite(t)) throw new Error(`setNow needs a finite timestamp, got ${t}`);
      reanchor(t);
      ticks.emit(now());
    },
    setSpeed(x) {
      reanchor(now());
      speed = clampSpeed(x);
      if (handle !== null) startTimer();
    },
    speed: () => speed,
    tick() {
      ticks.emit(now());
    },
    resetNow() {
      reanchor(wallNow());
      speed = 1;
      if (handle !== null) startTimer();
      ticks.emit(now());
    },
    monotonic: monoNow,
    stop() {
      stopTimer();
      ticks = createEmitter<number>(); // drops every subscriber
    },
  };
}
