// OWNER: B (Spec B — Day & quests). See docs/specs/B-day-quests.md.
// Fakes for Planner and Quests. A and C build against these until B flips USE_REAL in ./index.ts
// at integration step 3.
import type {
  Block,
  GetServices,
  Planner,
  Posture,
  Quest,
  Quests,
  QuestsDebug,
  Seed,
  TaskType,
  Verdict,
} from '../contracts';
import { createEmitter, HOUR } from '../shared/emitter';

/** `offer` (B8/B9): Today asks for a specific quest — a plan task's Verify or the suggested quest. */
export type SheetRequest = { from: 'storm_screen' | 'today'; posture: Posture; pkg?: string; offer?: { type: TaskType; taskId?: string } };

/** QuestSheetHost (B) and PlanMyDaySheet (B) listen to these. */
export const sheetRequests = createEmitter<SheetRequest>();
export const planSheetRequests = createEmitter<void>();

const HOME = { lat: 33.4242, lon: -111.9281 };

function todayAt(now: number, h: number, m = 0) {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function createFakeDay(get: GetServices) {
  const plannerChanges = createEmitter<void>();
  const verified = createEmitter<{ q: Quest; v: Verdict; minted: number }>();
  let hasPlan = true;
  let done = 2;
  const total = () => (hasPlan ? 5 : 0);
  let active: Quest[] = [];
  let steps = 0;

  const now = () => get().clock.now();

  const blocks = (t: number): Block[] =>
    hasPlan
      ? [{ type: 'class', title: 'Algorithms', start: todayAt(t, 10), end: todayAt(t, 11) }]
      : [];

  const planner: Planner = {
    planSet: () => hasPlan,
    progress: () => ({ done: hasPlan ? done : 0, total: total() }),
    currentBlock: (t) => blocks(t).find((b) => b.start <= t && t < b.end) ?? null,
    nextBlock: (t) => blocks(t).find((b) => b.start > t) ?? null,
    sleepWindow: () => ({ start: '23:00', end: '07:00' }),
    home: () => HOME,
    remindersDue(t) {
      if (hasPlan) return null;
      const h = new Date(t).getHours();
      if (h >= 7 && h < 10) return 'morning';
      if (h === 12) return 'noon';
      return null;
    },
    openPlanSheet: () => planSheetRequests.emit(),
    onChange: (fn) => plannerChanges.on(() => fn()),
  };

  const quests: Quests = {
    openSheet: (ctx) => sheetRequests.emit(ctx),
    active: () => active,
    onVerified: (fn) => verified.on(({ q, v, minted }) => fn(q, v, minted)),
  };

  /** Accept a quest (stub sheet and tests use this). */
  const accept = (type: TaskType = 'fitness'): Quest => {
    const t = now();
    const q: Quest = {
      id: `q-${t}`,
      type,
      target: type === 'fitness' ? 2000 : 1,
      acceptedAt: t,
      expiresAt: t + 4 * HOUR,
      baseline: { steps },
      status: 'active',
    };
    active = [...active, q];
    return q;
  };

  const pass = (q: Quest) => {
    const { event } = get().ledger.credit({ category: q.type, questId: q.id, rate: 1 });
    const passed = { ...q, status: 'passed' as const };
    active = active.filter((a) => a.id !== q.id);
    if (hasPlan && done < total()) done += 1;
    const v: Verdict = { questId: q.id, pass: true, method: 'step_delta', reason: 'Done', measured: `${steps} steps`, flags: [] };
    verified.emit({ q: passed, v, minted: event.deltaMinutes });
    plannerChanges.emit();
  };

  const debug: QuestsDebug & { accept: typeof accept; setPlan(on: boolean): void } = {
    reset() {
      hasPlan = true;
      done = 2;
      active = [];
      steps = 0;
      plannerChanges.emit();
    },
    seed(s: Seed) {
      debug.reset();
      if (s === 'no_plan') debug.setPlan(false);
    },
    addSteps(n) {
      steps += n;
    },
    passActive() {
      const q = active[0] ?? accept('fitness');
      pass(q);
    },
    accept,
    setPlan(on) {
      hasPlan = on;
      plannerChanges.emit();
    },
  };

  return { services: { planner, quests }, debug };
}
