// OWNER: C (Spec C — task C2). See docs/specs/C-engine-cloud.md and "Scoring" in the planning doc.
//
// Focus Pressure, 0..100, as a pure function of Signals. The worked-day table in the planning doc
// is the test suite (src/engine/__tests__/scoring.test.ts). Bands here are the plain score → band
// map; the enter/exit asymmetry, hold and grace are C3 (transitions), built on top.
import type { Posture, Signals } from '../contracts';

// ---- the numbers (planning doc, "Scoring") ----
export const DEFICIT_MAX_POINTS = 25;
export const VELOCITY_LOW_MIN = 20; // 20–40 min in the last hour → +15
export const VELOCITY_HIGH_MIN = 40; // over 40 → +25 (not stacked)
export const VELOCITY_LOW_POINTS = 15;
export const VELOCITY_HIGH_POINTS = 25;
export const URGE_MIN_OPENS = 3; // 3+ opens of one sealed app in 15 min → +10
export const URGE_POINTS = 10;
export const WIN_WINDOW_MIN = 60; // a quest verified in the last 60 min → −15
export const WIN_POINTS = -15;
/** Outside a declared block (base 0) the score can't pass 25 + 25 + 10, below the Storm line. */
export const MAX_OUTSIDE_BLOCK = 60;
export const METERED_AT = 35;
export const SEALED_AT = 65;

/** Non-finite or negative inputs count as 0 ("missing inputs count 0"). */
const nonNeg = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Points for the plan deficit: round(25 × deficit), halves round up. */
export function deficitPoints(deficit: number): number {
  // Round to 1e-6 first so float noise (0.5 − 0.4 = 0.0999…) can't turn an exact half into a round-down.
  const exact = Math.round(DEFICIT_MAX_POINTS * clamp(nonNeg(deficit), 0, 1) * 1e6) / 1e6;
  return Math.floor(exact + 0.5);
}

/** Scroll velocity: the higher band applies, they never stack. */
export function velocityPoints(scrollMinutes60: number): number {
  const m = nonNeg(scrollMinutes60);
  if (m > VELOCITY_HIGH_MIN) return VELOCITY_HIGH_POINTS;
  if (m >= VELOCITY_LOW_MIN) return VELOCITY_LOW_POINTS;
  return 0;
}

export function urgePoints(urgeCount15: number): number {
  return nonNeg(urgeCount15) >= URGE_MIN_OPENS ? URGE_POINTS : 0;
}

export function winPoints(minutesSinceWin: number | null): number {
  const m = minutesSinceWin;
  const recent = typeof m === 'number' && Number.isFinite(m) && m >= 0 && m < WIN_WINDOW_MIN;
  return recent ? WIN_POINTS : 0;
}

export type Contributions = {
  base: number;
  deficit: number;
  scrolling: number;
  urge: number;
  win: number;
};

/**
 * What each signal adds this tick. While free time is left only the base and the win count;
 * deficit, scroll velocity and urges switch on once it runs out.
 */
export function contributions(signals: Signals): Contributions {
  const s = signals ?? ({} as Signals);
  const behaviourOn = nonNeg(s.allowanceLeftMin) === 0;
  return {
    base: clamp(nonNeg(s.baseScore), 0, 100),
    deficit: behaviourOn ? deficitPoints(s.deficit) : 0,
    scrolling: behaviourOn ? velocityPoints(s.scrollMinutes60) : 0,
    urge: behaviourOn ? urgePoints(s.urgeCount15) : 0,
    win: winPoints(s.minutesSinceWin),
  };
}

/** The score for one 60-s tick: base + behaviour + win, max 60 outside a block, clamped to 0..100. */
export function score(signals: Signals): number {
  const c = contributions(signals);
  const raw = c.base + c.deficit + c.scrolling + c.urge + c.win;
  const capped = c.base > 0 ? raw : Math.min(raw, MAX_OUTSIDE_BLOCK);
  return clamp(capped, 0, 100);
}

/** The plain band for a score (no hysteresis — that is C3). */
export function bandOf(s: number): Posture {
  if (s >= SEALED_AT) return 'sealed';
  if (s >= METERED_AT) return 'metered';
  return 'open';
}
