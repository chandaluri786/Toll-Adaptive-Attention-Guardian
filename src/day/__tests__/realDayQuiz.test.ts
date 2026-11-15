import type { Services } from '../../contracts';
import { createFakeDevice } from '../../device/fakes';
import { createFakeEngine } from '../../engine/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import type { QuizFetch } from '../quiz-client';
import { createRealDay } from '../real';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const nine = (tag: string) => Array.from({ length: 9 }, (_, i) => ({ q: `${tag} ${i}?`, options: ['a', 'b', 'c', 'd'], correct: 0 }));
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(quiz?: { baseUrl: string; fetch: QuizFetch }) {
  const services = {} as Services;
  const get = () => services;
  const engine = createFakeEngine();
  engine.debug.clock.setNow(at(9));
  const kv = createMemoryKV();
  const day = createRealDay(get, {
    store: () => createPlannerStore({ kv, now: () => get().clock.now() }),
    kv: () => kv,
    steps: () => ({ subscribe: () => () => {} }),
    ...(quiz ? { quiz } : {}),
  });
  Object.assign(services, engine.services, createFakeLedger(get).services, createFakeDevice(get).services, day.services);
  return { day, now: () => get().clock.now() };
}

describe('real day + quiz', () => {
  test('starting a day with study tasks sends one request with all the topics', async () => {
    const bodies: unknown[] = [];
    const fetch: QuizFetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ Graphs: nine('g'), DP: nine('d') }) };
    };
    const { day, now } = setup({ baseUrl: 'https://quiz.example', fetch });
    const engine = day.engine();
    const store = day.plannerStore();

    createPlanActions(store, { now }).startPlan([
      { type: 'study', title: 'Graphs', topic: 'Graphs' },
      { type: 'study', title: 'DP', topic: 'DP' },
    ]);
    await flush();

    expect(bodies).toEqual([{ topics: ['Graphs', 'DP'] }]);
    const [first] = store.getState().plan!.tasks;
    expect(engine.quizReady(first.id)).toBe(true);
    expect(engine.suggest()).toMatchObject({ type: 'study', taskId: first.id });
  });

  test('no quiz server configured → study tasks verify by focus', async () => {
    const { day, now } = setup();
    const store = day.plannerStore();
    createPlanActions(store, { now }).startPlan([{ type: 'study', title: 'Graphs', topic: 'Graphs' }]);
    await flush();
    expect(day.engine().suggest()).toMatchObject({ type: 'focus' });
  });

  test('the quiz bank shares the day KV under day:quiz', async () => {
    const fetch: QuizFetch = async () => ({ ok: true, status: 200, json: async () => ({ Graphs: nine('g') }) });
    const kv = createMemoryKV();
    const services = {} as Services;
    const get = () => services;
    const engine = createFakeEngine();
    engine.debug.clock.setNow(at(9));
    const day = createRealDay(get, {
      store: () => createPlannerStore({ kv, now: () => get().clock.now() }),
      kv: () => kv,
      steps: () => ({ subscribe: () => () => {} }),
      quiz: { baseUrl: 'https://quiz.example', fetch },
    });
    Object.assign(services, engine.services, createFakeLedger(get).services, createFakeDevice(get).services, day.services);
    createPlanActions(day.plannerStore(), { now: () => get().clock.now() }).startPlan([{ type: 'study', title: 'Graphs', topic: 'Graphs' }]);
    await flush();
    expect(kv.keys()).toContain('day:quiz');
  });
});
