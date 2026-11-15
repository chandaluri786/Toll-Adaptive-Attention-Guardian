// OWNER: C (task C5). The engine-side inputs of a DaySummary that the ledger can't derive from its
// own events: Restricted minutes (and those past free time), Storm minutes, and plan progress.
// Everything is read through get() and the contract — usage samples, posture, the planner.
// Kept per local day under `ledger:days`, pruned past 180 days. Never leaves the phone.
import type { GetServices, Unsub } from '../contracts';
import { readJson, type KV } from './kv';
import { dayKey } from './time';

export const DAYS_KEY = 'days';

export type DayInputs = {
  restrictedSec: number;
  pastFreeSec: number;
  stormMin: number;
  tasksPlanned: number | null; // null = no plan that day
  tasksDone: number;
};

export const EMPTY_DAY: DayInputs = { restrictedSec: 0, pastFreeSec: 0, stormMin: 0, tasksPlanned: null, tasksDone: 0 };

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function parseDay(v: unknown): DayInputs | null {
  if (typeof v !== 'object' || v === null) return null;
  const d = v as Record<string, unknown>;
  if (![d.restrictedSec, d.pastFreeSec, d.stormMin, d.tasksDone].every(isCount)) return null;
  if (d.tasksPlanned !== null && !isCount(d.tasksPlanned)) return null;
  return d as DayInputs;
}

/** Never trust storage: drop malformed days, keep the rest. */
function parseDays(raw: unknown): Record<string, DayInputs> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, DayInputs> = {};
  for (const [date, v] of Object.entries(raw)) {
    const day = parseDay(v);
    if (day) out[date] = day;
  }
  return out;
}

export type DayTracker = {
  /** Subscribe to usage samples, clock ticks and plan changes (via get()). */
  start(): void;
  stop(): void;
  /** Inputs for `date`; today's plan progress is read live. */
  inputsFor(date: string): DayInputs;
  /** Keep only days from `oldestKept` on. */
  prune(oldestKept: string): void;
  reset(): void;
};

export function createDayTracker({ get, kv }: { get: GetServices; kv: KV }): DayTracker {
  let days: Readonly<Record<string, DayInputs>> = parseDays(readJson(kv, DAYS_KEY));
  let subs: Unsub[] = [];

  const now = () => get().clock.now();
  const save = () => kv.set(DAYS_KEY, JSON.stringify(days));
  const plan = (): Pick<DayInputs, 'tasksPlanned' | 'tasksDone'> => {
    const { planner } = get();
    const { done, total } = planner.progress();
    return { tasksPlanned: planner.planSet() ? total : null, tasksDone: done };
  };
  const update = (patch: (d: DayInputs) => Partial<DayInputs>) => {
    const date = dayKey(now());
    const cur = days[date] ?? EMPTY_DAY;
    days = { ...days, [date]: { ...cur, ...patch(cur) } };
  };

  const onSample = (appClass: string) => {
    if (appClass !== 'restricted') return;
    const pastFree = get().postureSource.get().allowanceLeftMin <= 0;
    update((d) => ({ restrictedSec: d.restrictedSec + 1, pastFreeSec: d.pastFreeSec + (pastFree ? 1 : 0) }));
  };
  // One tick = one clock minute (the clock ticks every clock minute, even sped up); setNow jumps don't count.
  const onTick = () => {
    const sealed = get().postureSource.get().posture === 'sealed';
    update((d) => ({ stormMin: d.stormMin + (sealed ? 1 : 0), ...plan() }));
    save();
  };
  const onPlan = () => {
    update(() => plan());
    save();
  };

  return {
    start() {
      if (subs.length) return;
      const s = get();
      subs = [s.usageFeed.onSample((x) => onSample(x.appClass)), s.clock.onTick(onTick), s.planner.onChange(onPlan)];
    },
    stop() {
      subs.forEach((u) => u());
      subs = [];
      save();
    },
    inputsFor(date) {
      const stored = days[date] ?? EMPTY_DAY;
      return date === dayKey(now()) ? { ...stored, ...plan() } : stored;
    },
    prune(oldestKept) {
      days = Object.fromEntries(Object.entries(days).filter(([d]) => d >= oldestKept));
      save();
    },
    reset() {
      days = {};
      kv.remove(DAYS_KEY);
    },
  };
}
