// OWNER: B. Demo-panel seeds for the real planner store, matching what the fake Planner shows:
// 'fresh' / 'demo_2pm' / 'late_night' = a 5-task plan (2 done) with Algorithms 10:00–11:00 every
// day and home set; 'no_plan' = home set, no plan, no timetable. Pure: time is passed in.
import { LOCK_AFTER_MS } from './plan';
import { defaultState, type Home, type PlannerState, type PlanTask, type WeeklyBlock } from './planner';
import { dayKey } from './time';

/** Same spot as the device fake's HOME (B can't import src/device). */
export const DEMO_HOME: Home = { lat: 33.4242, lon: -111.9281 };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const ALGORITHMS: WeeklyBlock = { id: 'seed-algorithms', type: 'class', title: 'Algorithms', days: EVERY_DAY, startMin: 10 * 60, endMin: 11 * 60 };

type SeedTask = Pick<PlanTask, 'type' | 'title' | 'done'> & { topic?: string };
/** Done first, then unfinished; the first unfinished one is fitness so passActive mints like the fake. */
const DEMO_TASKS: SeedTask[] = [
  { type: 'focus', title: 'Morning deep work', done: 1 },
  { type: 'study', title: 'Algorithms review', topic: 'Graph algorithms', done: 1 },
  { type: 'fitness', title: 'Walk 2,000 steps', done: 0 },
  { type: 'place', title: 'Library session', done: 0 },
  { type: 'meetup', title: 'Coffee with a friend', done: 0 },
];

/** A plan started 30 min ago (so it is locked in), plus the Algorithms class and home. */
export function demoState(now: number): PlannerState {
  const startedAt = now - LOCK_AFTER_MS;
  const tasks: PlanTask[] = DEMO_TASKS.map((t, i) => ({ ...t, id: `seed-t${i + 1}`, addedAt: startedAt, rate: 1 }));
  return { ...defaultState(), home: { ...DEMO_HOME }, blocks: [ALGORITHMS], plan: { day: dayKey(now), startedAt, tasks } };
}

export function noPlanState(): PlannerState {
  return { ...defaultState(), home: { ...DEMO_HOME } };
}
