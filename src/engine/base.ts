// OWNER: C (task C2). Step 1 of Scoring: the schedule sets a base. Plus the deficit formula's
// inputs. Pure functions over what B's Planner reports; C never imports src/day.
import type { Block } from '../contracts';
import { inWindow, minutesOfDay, nextLocalAt, parseHm, windowMinutes } from './time';

/** Base table (planning doc, "Step 1 — your schedule sets a base"). Deep work is 50 = Cloudy. */
export const BASE: Record<Block['type'], number> = {
  sleep: 70,
  class: 65,
  meeting: 65,
  deep_work: 50,
  wind_down: 40,
};
export const HOUR_BEFORE_BED_MIN = 60;
export const DEFAULT_SLEEP = { start: '23:00', end: '07:00' } as const;

/** Where the base came from, so the reason can name it. */
export type BaseSource =
  | { kind: 'none' }
  | { kind: 'block'; block: Block }
  | { kind: 'sleep'; until: number } // until = end of the sleep window
  | { kind: 'wind_down'; until: number }; // the hour before bed; until = end of the sleep window

export type SleepWindow = { start: string; end: string };
type SleepMinutes = { start: number; end: number };

/** A malformed or empty sleep window falls back to the default 23:00–07:00. */
export function sleepMinutes(w: SleepWindow | null | undefined): SleepMinutes {
  const start = parseHm(w?.start);
  const end = parseHm(w?.end);
  if (start === null || end === null || start === end) {
    return { start: parseHm(DEFAULT_SLEEP.start) as number, end: parseHm(DEFAULT_SLEEP.end) as number };
  }
  return { start, end };
}

export function inSleep(now: number, w: SleepWindow | null | undefined): boolean {
  const s = sleepMinutes(w);
  return inWindow(minutesOfDay(now), s.start, s.end);
}

/** The highest base that applies now: sleep window, the current declared block, or the hour before bed. */
export function baseFor(
  now: number,
  block: Block | null,
  w: SleepWindow | null | undefined,
): { baseScore: number; source: BaseSource } {
  const s = sleepMinutes(w);
  const m = minutesOfDay(now);
  const sleepEnd = nextLocalAt(now, s.end);
  const candidates: { baseScore: number; source: BaseSource }[] = [];
  if (inWindow(m, s.start, s.end)) candidates.push({ baseScore: BASE.sleep, source: { kind: 'sleep', until: sleepEnd } });
  if (block && BASE[block.type] !== undefined) candidates.push({ baseScore: BASE[block.type], source: { kind: 'block', block } });
  const windDownStart = (s.start - HOUR_BEFORE_BED_MIN + 24 * 60) % (24 * 60);
  if (inWindow(m, windDownStart, s.start)) {
    candidates.push({ baseScore: BASE.wind_down, source: { kind: 'wind_down', until: sleepEnd } });
  }
  return candidates.reduce((best, c) => (c.baseScore > best.baseScore ? c : best), {
    baseScore: 0,
    source: { kind: 'none' } as BaseSource,
  });
}

/**
 * deficit = max(0, elapsed share of the waking day − done share). The waking day runs from the end
 * of the sleep window to its start. 0 inside the sleep window and with no tasks.
 */
export function deficitFor(
  now: number,
  progress: { done: number; total: number } | null | undefined,
  w: SleepWindow | null | undefined,
): number {
  const total = Number(progress?.total);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const s = sleepMinutes(w);
  const m = minutesOfDay(now);
  if (inWindow(m, s.start, s.end)) return 0;
  const waking = windowMinutes(s.end, s.start);
  if (waking === 0) return 0;
  const elapsed = windowMinutes(s.end, m) / waking;
  const done = Math.min(Math.max(Number(progress?.done) || 0, 0), total);
  return Math.max(0, elapsed - done / total);
}
