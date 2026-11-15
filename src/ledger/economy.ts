// OWNER: C (task C5). The economy's numbers, straight from the planning doc's "incentive economy".
import type { TaskType } from '../contracts';

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
