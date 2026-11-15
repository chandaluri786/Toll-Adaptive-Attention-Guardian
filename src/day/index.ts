// OWNER: B (Spec B — Day & quests). See docs/specs/B-day-quests.md.
// Provides: Planner, Quests. Consumes (via get()): Clock, PostureSource, Ledger, DeviceSignals.
import type { GetServices } from '../contracts';
import { createFakeDay } from './fakes';
import { createMemoryKV } from './kv';
import { createPlannerStore, type PlannerStore } from './planner';
import type { GithubFetch } from './github-client';
import type { QuizFetch } from './quiz-client';
import { QUIZ_API_URL } from './quizConfig';
import type { QuestEngine } from './quests';
import { createRealDay as createRealDayWith, type RealDayDeps } from './real';

/** Flip to true at integration step 3, once B1–B3 are done. */
export const USE_REAL = true;

/** The fake has no engine or store; B's screens fall back to the fakes when they are missing. */
export type DayModule = ReturnType<typeof createFakeDay> & { engine?: () => QuestEngine; plannerStore?: () => PlannerStore };

export function createDay(get: GetServices): DayModule {
  if (USE_REAL) return createRealDay(get);
  return createFakeDay(get);
}

/**
 * Native storage (MMKV) and the pedometer, loaded only when first used so the fake path never
 * pulls in native modules. `./store` imports `../services`, hence the lazy require.
 */
const nativeDeps: RealDayDeps = {
  store: () => (require('./store') as typeof import('./store')).getPlannerStore(),
  kv: () => (require('./store') as typeof import('./store')).getDayKV(),
  steps: () => (require('./pedometer') as typeof import('./pedometer')).createPermittedStepSource(),
  github: { fetch: ((url, init) => fetch(url, init as RequestInit)) as GithubFetch },
  ...(QUIZ_API_URL ? { quiz: { baseUrl: QUIZ_API_URL, fetch: ((url, init) => fetch(url, init as RequestInit)) as QuizFetch } } : {}),
};

/** jest can't load MMKV (nitro ships ESM): app-level tests get memory storage and a silent pedometer. */
function jestDeps(get: GetServices): RealDayDeps {
  const kv = createMemoryKV();
  return {
    store: () => createPlannerStore({ kv, now: () => get().clock.now() }),
    kv: () => kv,
    steps: () => ({ subscribe: () => () => {} }),
  };
}

const isJest = () => typeof process !== 'undefined' && process.env?.JEST_WORKER_ID != null;

function createRealDay(get: GetServices): DayModule {
  return createRealDayWith(get, isJest() ? jestDeps(get) : nativeDeps);
}
