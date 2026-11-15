// OWNER: B (Spec B — task B3). Pure quest rules: targets, cooldown, the daily step cap, and the
// one suggested quest sized to the time of day. Rules: "Task verification" in the planning doc.
import type { TaskType, Verdict } from '../contracts';
import { HOUR, MIN } from '../shared/emitter';
import { TASK_LABELS } from './plan';
import { todaysPlan, type PlannerState } from './planner';
import { formatHHMM, minutesOfDay, parseHHMM, windowMinutes } from './time';

export const QUEST_TTL_MS = 4 * HOUR;
export const COOLDOWN_MS = 2 * HOUR;
export const RETRY_AFTER_MS = 5 * MIN;
export const DAILY_STEP_TARGET = 7_000;
export const CLAIM_HALF_RATE = 0.5;
/** Soft flags (implausible pace, flat steps on a place quest) lower the rate, never block. */
export const FLAGGED_RATE = 0.75;
/** A 45-min place quest more than 500 m away with fewer steps than this looks like a drive-by claim. */
export const FLAT_STEPS = 300;
/** Outdoor quests are not suggested in the last hour before sleep. */
const OUTDOOR_BUFFER_MIN = 60;

export const QUEST_TARGETS: Record<TaskType, number> = {
  fitness: 2_000, // steps
  place: 45, // minutes away from home
  meetup: 2, // code words read (of 3)
  study: 3, // quiz questions (P1)
  coding: 1, // commits (P1)
  focus: 25, // minutes with the screen off
};

/** Rough time a quest takes, used to size suggestions to what's left of the day. */
const EST_MINUTES: Record<TaskType, number> = { fitness: 20, place: 45, meetup: 45, study: 10, coding: 30, focus: 25 };
const OUTDOOR: TaskType[] = ['fitness', 'place', 'meetup'];
const NEEDS_HOME: TaskType[] = ['place', 'meetup'];

export const METHOD_FOR: Record<TaskType, Verdict['method']> = {
  fitness: 'step_delta',
  place: 'away_minutes',
  meetup: 'meetup_code',
  study: 'quiz',
  coding: 'commit_delta',
  focus: 'screen_off',
};

const GOAL_TITLES: Record<TaskType, string> = {
  fitness: 'Walk 2,000 steps',
  place: '45 minutes somewhere other than home',
  meetup: 'Meet up with someone — snap the code',
  study: 'Quick quiz',
  coding: 'Push a commit',
  focus: '25 minutes with the phone down',
};

/**
 * The quest type that verifies a task. Study falls back to focus until the quiz (B10) lands;
 * coding has no verifier until B11, so it gets no quest yet.
 */
export function questTypeFor(task: TaskType): TaskType | null {
  if (task === 'study') return 'focus';
  if (task === 'coding') return null;
  return task;
}

export type Offer = { type: TaskType; taskId?: string; title: string; target: number; estMin: number };

export type RuleContext = {
  now: number;
  stepsToday: number;
  activeTypes: TaskType[];
  lastPassed: Partial<Record<TaskType, number>>;
  hasHome: boolean;
};

/** Why a quest of this type can't start right now (friendly copy), or null if it can. */
export function blockedReason(type: TaskType, ctx: RuleContext): string | null {
  if (questTypeFor(type) !== type) return `${TASK_LABELS[type]} quests aren't ready yet`;
  if (ctx.activeTypes.includes(type)) return `You already have a ${TASK_LABELS[type].toLowerCase()} quest going`;
  if (type === 'fitness' && ctx.stepsToday >= DAILY_STEP_TARGET) return "You've hit 7,000 steps today — rest those legs";
  const last = ctx.lastPassed[type];
  if (last !== undefined && ctx.now < last + COOLDOWN_MS) {
    return `Next ${TASK_LABELS[type].toLowerCase()} quest from ${formatHHMM(minutesOfDay(last + COOLDOWN_MS))}`;
  }
  if (NEEDS_HOME.includes(type) && !ctx.hasHome) return 'Set your home first — Settings → Planner';
  return null;
}

/** Minutes until the sleep window starts, or null while inside it. */
export function minutesUntilSleep(state: PlannerState, now: number): number | null {
  const start = parseHHMM(state.sleep.start);
  const end = parseHHMM(state.sleep.end);
  const m = minutesOfDay(now);
  if (windowMinutes(start, m) < windowMinutes(start, end)) return null;
  return windowMinutes(m, start);
}

function fitsTimeOfDay(type: TaskType, minutesLeft: number): boolean {
  const need = EST_MINUTES[type] + (OUTDOOR.includes(type) ? OUTDOOR_BUFFER_MIN : 0);
  return need <= minutesLeft;
}

/** One quest: today's unfinished plan tasks first, then standing goals; sized to the time left. */
export function suggestQuest(state: PlannerState, ctx: RuleContext): Offer | null {
  const minutesLeft = minutesUntilSleep(state, ctx.now);
  if (minutesLeft === null) return null;
  const fromPlan = (todaysPlan(state, ctx.now)?.tasks ?? [])
    .filter((t) => t.done < 1)
    .map((t) => ({ type: questTypeFor(t.type), taskId: t.id as string | undefined, title: t.title }));
  const fromGoals = state.goals.map((g) => ({ type: questTypeFor(g.type), taskId: undefined, title: '' }));
  for (const c of [...fromPlan, ...fromGoals]) {
    if (!c.type || blockedReason(c.type, ctx) || !fitsTimeOfDay(c.type, minutesLeft)) continue;
    const offer: Offer = { type: c.type, title: c.title || GOAL_TITLES[c.type], target: QUEST_TARGETS[c.type], estMin: EST_MINUTES[c.type] };
    return c.taskId ? { ...offer, taskId: c.taskId } : offer;
  }
  return null;
}
