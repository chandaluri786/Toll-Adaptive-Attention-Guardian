// OWNER: B. The real day module: Planner over the persisted planner store, Quests from the quest
// engine, and debug hooks shaped exactly like createFakeDay's. Storage and the step source are
// injected (./index.ts passes MMKV + the pedometer; tests pass memory KV + a fake step source).
// `get()` is late-bound: services fills after every factory runs, so nothing here calls get()
// until a service method is used, and the engine starts on the first call once the clock exists.
import type { DeviceSignals, GetServices, Planner, Quest, Quests, QuestsDebug, Seed, TaskType } from '../contracts';
import { planSheetRequests, sheetRequests } from './fakes';
import type { KV } from './kv';
import { createPlanActions, type PlanActions } from './plan';
import { createPlanner, defaultState, todaysPlan, type PlannerStore } from './planner';
import { questTypeFor } from './quest-rules';
import { createQuestEngine, type QuestEngine, type StepSource } from './quests';
import { demoState, noPlanState } from './seeds';

export type RealDayDeps = {
  /** Called once, on first use. */
  store: () => PlannerStore;
  kv: () => KV;
  steps: () => StepSource;
};

type Core = { store: PlannerStore; planActions: PlanActions; planner: Planner; engine: QuestEngine };
export type RealDayDebug = QuestsDebug & { accept(type?: TaskType): Quest; setPlan(on: boolean): void };

/** DeviceSignals that resolve A's service at call time. */
function lateSignals(get: GetServices): DeviceSignals {
  return {
    onScreen: (fn) => get().deviceSignals.onScreen(fn),
    startLocation: () => get().deviceSignals.startLocation(),
    stopLocation: () => get().deviceSignals.stopLocation(),
    onLocation: (fn) => get().deviceSignals.onLocation(fn),
  };
}

export function createRealDay(get: GetServices, deps: RealDayDeps) {
  const now = () => get().clock.now();
  let core: Core | null = null;
  let started = false;

  const build = (): Core => {
    const store = deps.store();
    const planActions = createPlanActions(store, { now });
    const planner = createPlanner(store, { now, openPlanSheet: () => planSheetRequests.emit() });
    const engine = createQuestEngine({
      now,
      kv: deps.kv(),
      ledger: { credit: (c) => get().ledger.credit(c) },
      deviceSignals: lateSignals(get),
      planner: store,
      planActions,
      steps: deps.steps(),
      onTick: (fn) => get().clock.onTick(fn),
      sheetRequests,
    });
    return { store, planActions, planner, engine };
  };

  /** Build on first use; start the engine (step + tick subscriptions) once services is filled. */
  const use = (): Core => {
    core ??= build();
    if (!started && get().clock) {
      started = true;
      core.engine.start();
    }
    return core;
  };

  const planner: Planner = {
    planSet: () => use().planner.planSet(),
    progress: () => use().planner.progress(),
    currentBlock: (t) => use().planner.currentBlock(t),
    nextBlock: (t) => use().planner.nextBlock(t),
    sleepWindow: () => use().planner.sleepWindow(),
    home: () => use().planner.home(),
    remindersDue: (t) => use().planner.remindersDue(t),
    openPlanSheet: () => use().planner.openPlanSheet(),
    onChange: (fn) => use().planner.onChange(fn),
  };

  const quests: Quests = {
    openSheet: (ctx) => use().engine.openSheet(ctx),
    active: () => use().engine.active(),
    onVerified: (fn) => use().engine.onVerified(fn),
  };

  /** Like the fake: passing with no live quest ticks the next unfinished plan task when it can. */
  const acceptNextPlanTask = ({ store, engine }: Core) => {
    const tasks = todaysPlan(store.getState(), now())?.tasks ?? [];
    for (const task of tasks) {
      const type = task.done < 1 ? questTypeFor(task.type) : null;
      if (type && engine.accept(type, task.id).ok) return;
    }
  };

  const debug: RealDayDebug = {
    /** Clears B's own state only (planner + quests, all under `day:`). */
    reset() {
      const { store, engine } = use();
      store.update(() => defaultState());
      engine.debug.reset();
    },
    seed(s: Seed) {
      debug.reset();
      use().store.update(() => (s === 'no_plan' ? noPlanState() : demoState(now())));
    },
    addSteps: (n) => use().engine.debug.addSteps(n),
    passActive() {
      const c = use();
      if (c.engine.active().length === 0) acceptNextPlanTask(c);
      c.engine.debug.passActive();
    },
    accept(type: TaskType = 'fitness') {
      const { engine } = use();
      const r = engine.accept(type);
      if (r.ok) return r.quest;
      const live = engine.active().find((q) => q.type === type);
      if (live) return live;
      throw new Error(r.error);
    },
    setPlan(on) {
      const { store } = use();
      if (!on) store.update((s) => ({ ...s, plan: null }));
      else if (!todaysPlan(store.getState(), now())) store.update(() => demoState(now()));
    },
  };

  return { services: { planner, quests }, debug };
}
