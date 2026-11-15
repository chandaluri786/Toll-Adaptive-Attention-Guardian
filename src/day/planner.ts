// OWNER: B (Spec B — task B1). The planner store (goals, weekly timetable, sleep window, home,
// today's plan) and the contract's Planner on top of it. Rules: "The Planner" in the doc.
// Pure: storage and time are injected, so everything here is unit-tested without a phone.
import type { Block, Planner, TaskType, Unsub } from '../contracts';
import { createEmitter } from '../shared/emitter';
import { readJson, type KV } from './kv';
import { dayKey, isHHMM, localAt, parseHHMM, windowMinutes } from './time';

export const MAX_BLOCK_MIN = 4 * 60;
export const MAX_SLEEP_MIN = 10 * 60;
export const DEFAULT_SLEEP = { start: '23:00', end: '07:00' } as const;
const STORAGE_KEY = 'planner';
const SCHEMA_VERSION = 1;

/** Timetable blocks the user declares. Sleep is not a block here: it is the sleep window. */
export type BlockType = Exclude<Block['type'], 'sleep'>;
export type WeeklyBlock = {
  id: string;
  type: BlockType;
  title: string;
  days: number[]; // 0 = Sunday … 6 = Saturday
  startMin: number; // minutes past midnight
  endMin: number; // same day, after startMin
};
export type NewBlock = Omit<WeeklyBlock, 'id'>;
export type Goal = { type: TaskType; label: string; target: number };
export type SleepWindow = { start: string; end: string };
export type Home = { lat: number; lon: number };

export type PlanTask = {
  id: string;
  type: TaskType; // fixed at creation
  title: string;
  topic?: string; // study tasks: sent to the quiz Lambda (B10)
  addedAt: number;
  rate: 1 | 0.5; // added after the plan locked = earns half
  done: 0 | 0.5 | 1; // 0.5 = self-declared ("Claim half")
};
export type DayPlan = { day: string; startedAt: number; tasks: PlanTask[] };

export type PlannerState = {
  version: number;
  goals: Goal[];
  blocks: WeeklyBlock[];
  sleep: SleepWindow;
  home: Home | null;
  plan: DayPlan | null;
};

/** Standing goals from the doc, one per task type. Users revise them rarely. */
export const DEFAULT_GOALS: Goal[] = [
  { type: 'fitness', label: '7,000 steps a day', target: 7_000 },
  { type: 'place', label: 'Gym or library 3 times a week', target: 3 },
  { type: 'meetup', label: 'One meetup a week', target: 1 },
  { type: 'study', label: 'One focused session each weekday', target: 1 },
  { type: 'coding', label: '5 commits a week', target: 5 },
  { type: 'focus', label: 'Two deep-work blocks a day', target: 2 },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  class: 'Class',
  meeting: 'Meeting',
  deep_work: 'Deep work',
  wind_down: 'Wind-down',
};

export function defaultState(): PlannerState {
  return { version: SCHEMA_VERSION, goals: DEFAULT_GOALS, blocks: [], sleep: { ...DEFAULT_SLEEP }, home: null, plan: null };
}

// ---- validation: returns a friendly message, or null when fine ----

export function validateBlock(b: NewBlock, existing: WeeklyBlock[]): string | null {
  if (b.days.length === 0) return 'Pick at least one day';
  if (b.endMin <= b.startMin) return 'A block has to end after it starts';
  if (b.endMin - b.startMin > MAX_BLOCK_MIN) return 'Blocks can be up to 4 hours — split longer ones';
  const clash = existing.find(
    (e) => e.days.some((d) => b.days.includes(d)) && b.startMin < e.endMin && e.startMin < b.endMin,
  );
  return clash ? `Overlaps with ${clash.title}` : null;
}

export function validateSleep(s: SleepWindow): string | null {
  if (!isHHMM(s.start) || !isHHMM(s.end)) return 'Use a time like 23:00';
  const length = windowMinutes(parseHHMM(s.start), parseHHMM(s.end));
  if (length === 0) return 'Sleep needs a start and an end';
  return length > MAX_SLEEP_MIN ? 'Sleep can be up to 10 hours' : null;
}

/** Keep only well-formed stored data; anything odd falls back to the default for that field. */
function loadState(raw: unknown): PlannerState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PlannerState>;
  const isNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  const home = r.home && isNum(r.home.lat) && isNum(r.home.lon) ? { lat: r.home.lat, lon: r.home.lon } : null;
  const sleep = r.sleep && validateSleep(r.sleep) === null ? { start: r.sleep.start, end: r.sleep.end } : base.sleep;
  const blocks = Array.isArray(r.blocks) ? r.blocks.filter((b) => b && typeof b.id === 'string' && isNum(b.startMin) && isNum(b.endMin) && Array.isArray(b.days)) : [];
  const goals = Array.isArray(r.goals) && r.goals.length > 0 ? r.goals : base.goals;
  const plan = r.plan && typeof r.plan.day === 'string' && Array.isArray(r.plan.tasks) ? r.plan : null;
  return { version: SCHEMA_VERSION, goals, blocks, sleep, home, plan };
}

// ---- store ----

export type AddResult = { ok: true } | { ok: false; error: string };

export type PlannerStore = {
  getState(): PlannerState;
  subscribe(fn: () => void): Unsub;
  /** Replace the whole state through a pure update. B2/B3 build their actions on this. */
  update(fn: (s: PlannerState) => PlannerState): void;
  setHome(home: Home): void;
  clearHome(): void;
  setSleep(sleep: SleepWindow): AddResult;
  addBlock(block: NewBlock): AddResult;
  removeBlock(id: string): void;
  setGoals(goals: Goal[]): void;
};

export function createPlannerStore(deps: { kv: KV; now: () => number }): PlannerStore {
  const changes = createEmitter<void>();
  let state = loadState(readJson(deps.kv, STORAGE_KEY));
  let seq = 0;

  const update = (fn: (s: PlannerState) => PlannerState) => {
    state = fn(state);
    deps.kv.set(STORAGE_KEY, JSON.stringify(state));
    changes.emit();
  };

  return {
    getState: () => state,
    subscribe: (fn) => changes.on(fn),
    update,
    setHome: (home) => update((s) => ({ ...s, home: { lat: home.lat, lon: home.lon } })),
    clearHome: () => update((s) => ({ ...s, home: null })),
    setSleep(sleep) {
      const error = validateSleep(sleep);
      if (error) return { ok: false, error };
      update((s) => ({ ...s, sleep: { start: sleep.start, end: sleep.end } }));
      return { ok: true };
    },
    addBlock(block) {
      const error = validateBlock(block, state.blocks);
      if (error) return { ok: false, error };
      const id = `b-${deps.now()}-${seq++}`;
      update((s) => ({ ...s, blocks: [...s.blocks, { ...block, days: [...block.days], id }] }));
      return { ok: true };
    },
    removeBlock: (id) => update((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) })),
    setGoals: (goals) => update((s) => ({ ...s, goals: goals.map((g) => ({ ...g })) })),
  };
}

// ---- the contract's Planner ----

/** Today's plan, or null if the stored plan belongs to an earlier day (no automatic rollover). */
export function todaysPlan(state: PlannerState, now: number): DayPlan | null {
  return state.plan && state.plan.day === dayKey(now) ? state.plan : null;
}

/** Concrete blocks on the calendar day `dayOffset` days from `now`. */
function blocksOn(state: PlannerState, now: number, dayOffset: number): Block[] {
  const weekday = new Date(localAt(now, 0, dayOffset)).getDay();
  return state.blocks
    .filter((b) => b.days.includes(weekday))
    .map((b) => ({ type: b.type, title: b.title, start: localAt(now, b.startMin, dayOffset), end: localAt(now, b.endMin, dayOffset) }))
    .sort((a, b) => a.start - b.start);
}

export type PlannerDeps = { now: () => number; openPlanSheet: () => void };

export function createPlanner(store: PlannerStore, deps: PlannerDeps): Planner {
  return {
    planSet: () => (todaysPlan(store.getState(), deps.now())?.tasks.length ?? 0) > 0,
    progress() {
      const tasks = todaysPlan(store.getState(), deps.now())?.tasks ?? [];
      return { done: tasks.reduce((sum, t) => sum + t.done, 0), total: tasks.length };
    },
    currentBlock: (t) => blocksOn(store.getState(), t, 0).find((b) => b.start <= t && t < b.end) ?? null,
    nextBlock(t) {
      const upcoming = [...blocksOn(store.getState(), t, 0), ...blocksOn(store.getState(), t, 1)];
      return upcoming.find((b) => b.start > t) ?? null;
    },
    sleepWindow: () => ({ ...store.getState().sleep }),
    home: () => (store.getState().home ? { ...store.getState().home! } : null),
    remindersDue: () => null, // B2
    openPlanSheet: () => deps.openPlanSheet(),
    onChange: (fn) => store.subscribe(fn),
  };
}
