// OWNER: B (Spec B — task B2). Today's plan ("today's contract") on top of the planner store:
// start with 1–7 typed tasks, a 30-min lock after which new tasks earn half, "Not today", and
// yesterday's unfinished tasks offered (never rolled over). Pure: time and storage are injected.
import type { TaskType } from '../contracts';
import { MIN } from '../shared/emitter';
import { blocksOn, isDeclined, todaysPlan, type AddResult, type DayPlan, type PlannerState, type PlannerStore, type PlanTask } from './planner';
import { dayKey, formatHHMM, minutesOfDay } from './time';

export { isDeclined };

export const MAX_TASKS = 7;
export const LOCK_AFTER_MS = 30 * MIN;
const DAY_MS = 24 * 60 * MIN;

export const TASK_TYPES: TaskType[] = ['fitness', 'place', 'meetup', 'study', 'coding', 'focus'];
export const TASK_LABELS: Record<TaskType, string> = {
  fitness: 'Fitness',
  place: 'Place',
  meetup: 'Meetup',
  study: 'Study',
  coding: 'Coding',
  focus: 'Focus',
};

export type NewTask = { type: TaskType; title: string; topic?: string };

/** Friendly message for a bad task, or null when fine. */
export function validateTask(task: NewTask): string | null {
  if (!TASK_TYPES.includes(task.type)) return 'Pick a task type';
  if (typeof task.title !== 'string' || task.title.trim() === '') return 'Give each task a short name';
  if (task.type === 'study' && !task.topic?.trim()) return 'Study tasks need a topic for the quiz';
  return null;
}

function firstTaskProblem(tasks: NewTask[]): string | null {
  for (const task of tasks) {
    const error = validateTask(task);
    if (error) return error;
  }
  return null;
}

export function isLocked(plan: DayPlan, now: number): boolean {
  return now >= plan.startedAt + LOCK_AFTER_MS;
}

/** Unfinished tasks from yesterday's plan, ready to offer this morning (types and topics kept). */
export function yesterdaysUnfinished(state: PlannerState, now: number): NewTask[] {
  const plan = state.plan;
  if (!plan || plan.day !== dayKey(now - DAY_MS)) return [];
  return plan.tasks.filter((t) => t.done < 1).map((t) => (t.topic ? { type: t.type, title: t.title, topic: t.topic } : { type: t.type, title: t.title }));
}

/** One line for the top of the sheet: storms can only happen inside today's timetable blocks. */
export function forecastLine(state: PlannerState, now: number): string {
  if (state.blocks.length === 0) return 'No timetable yet — add one for a smarter forecast';
  const today = blocksOn(state, now, 0);
  if (today.length === 0) return 'Nothing on your timetable today — clear skies ahead';
  const parts = today.map((b) => `${b.title} ${formatHHMM(minutesOfDay(b.start))}–${formatHHMM(minutesOfDay(b.end))}`);
  return `Storms possible during ${parts.join(' · ')}`;
}

export type PlanActions = {
  startPlan(tasks: NewTask[]): AddResult;
  addTask(task: NewTask): AddResult;
  removeTask(id: string): AddResult;
  /** B3 calls this when a quest from a plan task verifies (1) or is self-declared (0.5). */
  markTask(id: string, done: 1 | 0.5): AddResult;
  decline(): void;
};

const fail = (error: string): AddResult => ({ ok: false, error });
const OK: AddResult = { ok: true };

export function createPlanActions(store: PlannerStore, deps: { now: () => number }): PlanActions {
  let seq = 0;
  const makeTask = (task: NewTask, now: number, rate: PlanTask['rate']): PlanTask => ({
    id: `t-${now}-${seq++}`,
    type: task.type,
    title: task.title.trim(),
    ...(task.type === 'study' && task.topic ? { topic: task.topic.trim() } : {}),
    addedAt: now,
    rate,
    done: 0,
  });
  const withTasks = (tasks: PlanTask[]) => (s: PlannerState): PlannerState => (s.plan ? { ...s, plan: { ...s.plan, tasks } } : s);

  return {
    startPlan(tasks) {
      const now = deps.now();
      if (todaysPlan(store.getState(), now)) return fail("Today's plan is already started");
      if (tasks.length === 0) return fail('Add at least one task');
      if (tasks.length > MAX_TASKS) return fail(`Up to ${MAX_TASKS} tasks a day`);
      const problem = firstTaskProblem(tasks);
      if (problem) return fail(problem);
      const plan: DayPlan = { day: dayKey(now), startedAt: now, tasks: tasks.map((t) => makeTask(t, now, 1)) };
      store.update((s) => ({ ...s, plan, declinedDay: null }));
      return OK;
    },
    addTask(task) {
      const now = deps.now();
      const plan = todaysPlan(store.getState(), now);
      if (!plan) return fail('Start the day first');
      if (plan.tasks.length >= MAX_TASKS) return fail(`Up to ${MAX_TASKS} tasks a day`);
      const problem = validateTask(task);
      if (problem) return fail(problem);
      store.update(withTasks([...plan.tasks, makeTask(task, now, isLocked(plan, now) ? 0.5 : 1)]));
      return OK;
    },
    removeTask(id) {
      const now = deps.now();
      const plan = todaysPlan(store.getState(), now);
      if (!plan || !plan.tasks.some((t) => t.id === id)) return fail('That task is not in today\'s plan');
      if (isLocked(plan, now)) return fail('The plan is locked in for today');
      if (plan.tasks.length === 1) return fail('A plan keeps at least one task — or choose "Not today"');
      store.update(withTasks(plan.tasks.filter((t) => t.id !== id)));
      return OK;
    },
    markTask(id, done) {
      const plan = todaysPlan(store.getState(), deps.now());
      if (!plan || !plan.tasks.some((t) => t.id === id)) return fail('That task is not in today\'s plan');
      store.update(withTasks(plan.tasks.map((t) => (t.id === id ? { ...t, done: Math.max(t.done, done) as PlanTask['done'] } : t))));
      return OK;
    },
    decline() {
      store.update((s) => ({ ...s, declinedDay: dayKey(deps.now()) }));
    },
  };
}
