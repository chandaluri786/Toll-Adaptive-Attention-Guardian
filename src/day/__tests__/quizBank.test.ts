import type { Quest } from '../../contracts';
import { MIN } from '../../shared/emitter';
import { createMemoryKV, type KV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { QUIZ_SECONDS, type QuizQuestion } from '../quiz';
import { createQuizBank, type QuizRequest } from '../quiz-bank';
import type { PoolResult } from '../quiz-client';

/** Local time on the Monday of the build weekend (Nov 16, 2026). */
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
/** Every generated question's right answer is option 0, so tests know what to tap. */
const nine = (tag: string): QuizQuestion[] => Array.from({ length: 9 }, (_, i) => ({ q: `${tag} ${i}?`, options: ['right', 'w1', 'w2', 'w3'], correct: 0 }));

function setup(opts: { kv?: KV; start?: number; request?: QuizRequest | null; topics?: string[] } = {}) {
  let now = opts.start ?? at(9);
  const kv = opts.kv ?? createMemoryKV();
  const store = createPlannerStore({ kv, now: () => now });
  const actions = createPlanActions(store, { now: () => now });
  const calls: string[][] = [];
  const answer = (topics: string[]): PoolResult => ({ pools: Object.fromEntries(topics.map((t) => [t, nine(t)])), missing: [] });
  const request: QuizRequest | null =
    opts.request === undefined
      ? async (topics) => {
          calls.push(topics);
          return answer(topics);
        }
      : opts.request;
  const bank = createQuizBank({ kv, now: () => now, planner: store, request });
  return { kv, store, actions, bank, calls, advance: (ms: number) => (now += ms), now: () => now };
}

function planStudy(s: ReturnType<typeof setup>, topics = ['Graph algorithms', 'Dynamic programming']) {
  const r = s.actions.startPlan([...topics.map((topic) => ({ type: 'study' as const, title: `Study ${topic}`, topic })), { type: 'fitness', title: 'Walk' }]);
  if (!r.ok) throw new Error(r.error);
  return s.store.getState().plan!.tasks;
}

const studyQuest = (s: ReturnType<typeof setup>, taskId?: string): Quest => ({
  id: `quest-${s.now()}`,
  type: 'study',
  ...(taskId ? { taskId } : {}),
  target: 3,
  acceptedAt: s.now(),
  expiresAt: s.now() + 4 * 60 * MIN,
  baseline: {},
  status: 'active',
});

describe('sync: one request when the day is planned', () => {
  test("sends all of today's study topics in one request, nothing else", async () => {
    const s = setup();
    const tasks = planStudy(s);

    await s.bank.sync();

    expect(s.calls).toEqual([['Graph algorithms', 'Dynamic programming']]);
    expect(s.bank.ready(tasks[0].id)).toBe(true);
    expect(s.bank.ready(tasks[1].id)).toBe(true);
    expect(s.bank.ready(tasks[2].id)).toBe(false); // fitness task
    expect(s.bank.ready()).toBe(true);
  });

  test('no plan or no study tasks → no request', async () => {
    const s = setup();
    await s.bank.sync();
    s.actions.startPlan([{ type: 'fitness', title: 'Walk' }]);
    await s.bank.sync();
    expect(s.calls).toEqual([]);
    expect(s.bank.ready()).toBe(false);
  });

  test('cached topics are not asked for again; a later study task asks only for its topic', async () => {
    const s = setup();
    planStudy(s, ['Graphs']);
    await s.bank.sync();
    await s.bank.sync();

    s.advance(60 * MIN); // after the lock: added at half rate, still gets a quiz
    s.actions.addTask({ type: 'study', title: 'Study DP', topic: 'DP' });
    await s.bank.sync();

    expect(s.calls).toEqual([['Graphs'], ['DP']]);
  });

  test('two syncs at once share one request', async () => {
    const s = setup();
    planStudy(s);
    await Promise.all([s.bank.sync(), s.bank.sync()]);
    expect(s.calls).toHaveLength(1);
  });

  test('pools are stored locally: a fresh start works offline', async () => {
    const online = setup();
    const tasks = planStudy(online);
    await online.bank.sync();

    const offline = createQuizBank({
      kv: online.kv,
      now: online.now,
      planner: online.store,
      request: async () => {
        throw new Error('offline');
      },
    });
    await offline.sync();

    expect(offline.ready(tasks[0].id)).toBe(true);
    expect(offline.round(studyQuest(online, tasks[0].id))?.questions).toHaveLength(3);
  });
});

describe('fallback to focus', () => {
  test('a topic the server could not make stays not-ready, and is not re-asked right away', async () => {
    const calls: string[][] = [];
    const s = setup({
      request: async (topics) => {
        calls.push(topics);
        return { pools: {}, missing: topics };
      },
    });
    const tasks = planStudy(s, ['Graphs']);

    await s.bank.sync();
    await s.bank.sync();
    expect(calls).toHaveLength(1);
    expect(s.bank.ready(tasks[0].id)).toBe(false);

    s.advance(31 * MIN);
    await s.bank.sync();
    expect(calls).toHaveLength(2);
  });

  test('a request that throws is treated like a miss, never an unhandled rejection', async () => {
    const s = setup({
      request: async () => {
        throw new Error('boom');
      },
    });
    const tasks = planStudy(s, ['Graphs']);
    await expect(s.bank.sync()).resolves.toBeUndefined();
    expect(s.bank.ready(tasks[0].id)).toBe(false);
  });

  test('no quiz server configured → never ready, no request', async () => {
    const s = setup({ request: null });
    const tasks = planStudy(s, ['Graphs']);
    await s.bank.sync();
    expect(s.bank.ready(tasks[0].id)).toBe(false);
  });

  test('corrupt stored data is ignored', async () => {
    const kv = createMemoryKV();
    kv.set('quiz', '{"pools": 5, "rounds": "x"}');
    const s = setup({ kv });
    const tasks = planStudy(s, ['Graphs']);
    expect(s.bank.ready(tasks[0].id)).toBe(false);
    await s.bank.sync();
    expect(s.bank.ready(tasks[0].id)).toBe(true);
  });
});

describe('rounds: 3 of 9, 90 seconds, pass at 2', () => {
  async function ready() {
    const s = setup();
    const tasks = planStudy(s);
    await s.bank.sync();
    const quest = studyQuest(s, tasks[1].id);
    return { s, quest };
  }

  test("draws 3 of the task's topic, without the answers, timed 90 s from now", async () => {
    const { s, quest } = await ready();

    const round = s.bank.round(quest)!;

    expect(round.topic).toBe('Dynamic programming');
    expect(round.questions).toHaveLength(3);
    round.questions.forEach((q) => {
      expect(q.q.startsWith('Dynamic programming')).toBe(true);
      expect(q).not.toHaveProperty('correct');
    });
    expect(round.startedAt).toBe(s.now());
    expect(round.endsAt).toBe(s.now() + QUIZ_SECONDS * 1000);
  });

  test('reopening the quiz keeps the same round and clock (no free reroll)', async () => {
    const { s, quest } = await ready();
    const first = s.bank.round(quest)!;
    s.advance(20_000);
    expect(s.bank.round(quest)).toEqual(first);
  });

  test('2 of 3 right → a pass verdict, method quiz', async () => {
    const { s, quest } = await ready();
    s.bank.round(quest);
    s.advance(40_000);

    const v = s.bank.grade(quest, [0, 0, 2])!;

    expect(v).toMatchObject({ questId: quest.id, pass: true, method: 'quiz', measured: '2 of 3 right', flags: [] });
  });

  test('1 of 3 → not yet, with a plain reason; the retry draws a different 3', async () => {
    const { s, quest } = await ready();
    const first = s.bank.round(quest)!;

    const v = s.bank.grade(quest, [0, 1, 1])!;
    expect(v.pass).toBe(false);
    expect(v.reason).toBe('1 of 3 right — 2 needed');

    s.advance(5 * MIN);
    const second = s.bank.round(quest)!;
    const firstQs = first.questions.map((q) => q.q);
    expect(second.questions.filter((q) => firstQs.includes(q.q))).toEqual([]);
  });

  test('time ran out → not yet', async () => {
    const { s, quest } = await ready();
    s.bank.round(quest);
    s.advance((QUIZ_SECONDS + 30) * 1000);
    const v = s.bank.grade(quest, [0, 0, 0])!;
    expect(v.pass).toBe(false);
    expect(v.reason).toBe('Time ran out — 90 seconds for all three');
  });

  test('grading with no open round returns null', async () => {
    const { s, quest } = await ready();
    expect(s.bank.grade(quest, [0, 0, 0])).toBeNull();
    s.bank.round(quest);
    s.bank.grade(quest, [0, 0, 0]);
    expect(s.bank.grade(quest, [0, 0, 0])).toBeNull();
  });

  test('the open round survives a restart', async () => {
    const { s, quest } = await ready();
    const first = s.bank.round(quest)!;
    const again = createQuizBank({ kv: s.kv, now: s.now, planner: s.store, request: null });
    expect(again.round(quest)).toEqual(first);
    expect(again.grade(quest, [0, 0, 0])?.pass).toBe(true);
  });

  test('a study quest without a task uses the first study topic with questions', async () => {
    const { s } = await ready();
    expect(s.bank.round(studyQuest(s))?.topic).toBe('Graph algorithms');
  });

  test('no questions for the topic → no round', async () => {
    const s = setup({ request: null });
    const tasks = planStudy(s, ['Graphs']);
    expect(s.bank.round(studyQuest(s, tasks[0].id))).toBeNull();
  });
});
