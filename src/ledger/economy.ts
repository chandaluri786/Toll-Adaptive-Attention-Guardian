// OWNER: C (tasks C5, C11). The economy's numbers, straight from the planning doc's "incentive economy".
import type { TaskType } from '../contracts';
import { DAY_START_HOUR } from './time';

/** Minutes minted per verified quest — "Earning" table in the planning doc. */
export const EARNING: Record<TaskType, number> = {
  fitness: 25,
  place: 25,
  meetup: 25,
  study: 20,
  coding: 20,
  focus: 15,
};

/** Daily mint cap ("Caps and decay"): stops quest-farming as a full-time job. */
export const DAILY_MINT_CAP = 150;

/** Forecast keeps this many local days of summaries (phone only). */
export const HISTORY_DAYS = 180;

/**
 * Diminishing returns (C11): the 1st, 2nd, 3rd and 4th+ quest of one category in one local day
 * pay 100% / 60% / 30% / 0 of the table. Whole percents so the maths stays exact.
 */
export const REPEAT_PERCENT: readonly number[] = [100, 60, 30, 0];

/** Percent paid when `repeats` quests of the same category already logged today. Bad input = first. */
export function repeatPercent(repeats: number): number {
  const n = Number.isFinite(repeats) ? Math.max(0, Math.floor(repeats)) : 0;
  return REPEAT_PERCENT[Math.min(n, REPEAT_PERCENT.length - 1)];
}

/** Late-night multiplier (C11): spending banked minutes costs 2× from 23:00 until the 04:00 reset. */
export const LATE_NIGHT_FROM_HOUR = 23;
export const LATE_NIGHT_MULTIPLIER = 2;

/** True from 23:00 local until the day resets at 04:00 (local wall time, never UTC). */
export function isLateNight(now: number): boolean {
  const h = new Date(now).getHours();
  return h >= LATE_NIGHT_FROM_HOUR || h < DAY_START_HOUR;
}

/** Banked minutes it takes to buy `minutes` of access at `now`. */
export const spendCost = (minutes: number, now: number): number =>
  isLateNight(now) ? minutes * LATE_NIGHT_MULTIPLIER : minutes;
