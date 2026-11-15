// OWNER: C (task C3). Weather transitions — a pure state machine over 60-s score readings.
// Planning doc, "Scoring": enter a stricter weather at its line, leave it 5 points below
// (the enter/exit asymmetry), a change must hold for 2 consecutive readings, every tightening
// starts with a 90-s "clouds gathering" advisory, and Storm needs a current declared block.
//
// During the advisory `posture` already shows the coming weather (so the reason and the Storm
// screen can say what is gathering) while `grace` is true; enforcement uses `enforcedPosture`,
// which is still the old weather until the 90 s are up.
import type { Posture } from '../contracts';
import { MIN } from '../shared/emitter';
import type { WeatherConfig } from './weatherConfig';

export const HOLD_READINGS = 2;
export const GRACE_MS = 90 * 1000;
export const READING_MS = MIN;

export type Reading = {
  at: number;
  score: number;
  /** A declared block (class, meeting, deep work, sleep window, hour before bed) is on now. */
  declared: boolean;
};

export type MachineState = {
  /** The weather shown. */
  posture: Posture;
  /** The weather enforced before the current advisory (equals posture when no grace). */
  from: Posture;
  graceUntil: number | null;
  /** The last HOLD_READINGS readings, oldest first. Kept as raw scores so an edited threshold re-reads them. */
  recent: readonly Reading[];
};

const LEVEL: Record<Posture, number> = { open: 0, metered: 1, sealed: 2 };
const BY_LEVEL: readonly Posture[] = ['open', 'metered', 'sealed'];
const tighter = (a: Posture, b: Posture) => LEVEL[a] > LEVEL[b];

export function initialMachine(posture: Posture = 'open'): MachineState {
  return { posture, from: posture, graceUntil: null, recent: [] };
}

/** The level a score enters, and the level it is allowed to stay at (5 below each line). */
function levels(score: number, declared: boolean, cfg: WeatherConfig) {
  const cap = declared ? LEVEL.sealed : LEVEL.metered; // storms only inside your own blocks
  const enter = score >= cfg.stormAt ? 2 : score >= cfg.cloudyAt ? 1 : 0;
  const stay = score >= cfg.stormAt - cfg.exitGap ? 2 : score >= cfg.cloudyAt - cfg.exitGap ? 1 : 0;
  return { enter: Math.min(enter, cap), stay: Math.min(stay, cap) };
}

/** Where one reading points, given the current weather (hysteresis, no hold). */
export function targetFor(current: Posture, score: number, declared: boolean, cfg: WeatherConfig): Posture {
  const cur = LEVEL[current];
  const { enter, stay } = levels(score, declared, cfg);
  if (enter > cur) return BY_LEVEL[enter];
  if (stay < cur) return BY_LEVEL[stay];
  return current;
}

export function enforcedPosture(s: MachineState): Posture {
  return s.graceUntil === null ? s.posture : s.from;
}

/** End an advisory whose 90 s are up. */
export function settle(s: MachineState, now: number): MachineState {
  if (s.graceUntil === null || now < s.graceUntil) return s;
  return { ...s, from: s.posture, graceUntil: null };
}

/** Move to `to` without starting a new advisory; an advisory survives only while `to` is still tighter than what is enforced. */
function loosenTo(s: MachineState, to: Posture, recent: readonly Reading[]): MachineState {
  const keepGrace = s.graceUntil !== null && tighter(to, s.from);
  return keepGrace ? { ...s, posture: to, recent } : { posture: to, from: to, graceUntil: null, recent };
}

/** Apply one 60-s reading. */
export function step(state: MachineState, reading: Reading, cfg: WeatherConfig): MachineState {
  const s = settle(state, reading.at);
  const recent = [...s.recent, reading].slice(-HOLD_READINGS);
  const cur = s.posture;

  // The block ended: leave Storm at once (never hold anyone in a storm outside their own block).
  if (cur === 'sealed' && !reading.declared) {
    return loosenTo(s, targetFor(cur, reading.score, false, cfg), recent);
  }
  if (recent.length < HOLD_READINGS) return { ...s, recent };

  const targets = recent.map((r) => LEVEL[targetFor(cur, r.score, r.declared, cfg)]);
  if (targets.every((t) => t > LEVEL[cur])) {
    const to = BY_LEVEL[Math.min(...targets)];
    return { posture: to, from: enforcedPosture(s), graceUntil: reading.at + GRACE_MS, recent };
  }
  if (targets.every((t) => t < LEVEL[cur])) {
    return loosenTo(s, BY_LEVEL[Math.max(...targets)], recent);
  }
  return { ...s, recent };
}

/** The next change the machine already knows about: the advisory ending, or a hold that one more reading completes. */
export function nextChangeOf(s: MachineState, cfg: WeatherConfig): { at: number; to: Posture } | null {
  if (s.graceUntil !== null) return { at: s.graceUntil, to: s.posture };
  const last = s.recent.at(-1);
  if (!last) return null;
  const to = targetFor(s.posture, last.score, last.declared, cfg);
  if (to === s.posture) return null;
  return { at: last.at + READING_MS + (tighter(to, s.posture) ? GRACE_MS : 0), to };
}
