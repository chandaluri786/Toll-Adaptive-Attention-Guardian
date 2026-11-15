import type { Quest, Services, Verdict } from '../../contracts';
import { createFakeDevice, HOME } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter, MIN } from '../../shared/emitter';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import type { QuizQuestion } from '../quiz';
import { createQuizBank } from '../quiz-bank';
import { createQuestEngine } from '../quests';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const nine = (tag: string): QuizQuestion[] => Array.from({ length: 9 }, (_, i) => ({ q: `${tag} ${i}?`, options: ['right', 'w1', 'w2', 'w3'], correct: 0 }));

async function setup(opts: { quizOnline?: boolean; withQuiz?: boolean } = {}) {
  let now = at(10);
  const get = (() => ({
    clock: { now: () => now, onTick: () => () => {} },
    postureSource: { get: () => ({ posture: 'open' }) },
  })) as unknown as () => Services;
  const kv = createMemoryKV();
  const store = createPlannerStore({ kv, now: () => now });
  store.setHome(HOME);
  const planActions = createPlanActions(store, { now: () => now });
  planActions.startPlan([
    { type: 'study', title: 'Graphs review', topic: 'Graph algorithms' },
    { type: 'fitness', title: 'Walk' },
  ]);
  const quiz = createQuizBank({
    kv,
    now: () => now,
    planner: store,
    request: async (topics) => (opts.quizOnline === false ? { pools: {}, missing: topics } : { pools: Object.fromEntries(topics.map((t) => [t, nine(t)])), missing: [] }),
  });
  await quiz.sync();
  const ledger = createFakeLedger(get);
  const engine = createQuestEngine({
    now: () => now,
    kv,
    ledger: ledger.services.ledger,
    deviceSignals: createFakeDevice(get).services.deviceSignals,
    planner: store,
    planActions,
    steps: { subscribe: () => () => {} },
    sheetRequests: createEmitter(),
    ...(opts.withQuiz === false ? {} : { quiz }),
  });
  engine.start();
  const verified: { q: Quest; v: Verdict; minted: number }[] = [];
  engine.onVerified((q, v, minted) => verified.push({ q, v, minted }));
  const studyTask = store.getState().plan!.tasks[0];
  return { engine, store, ledger, verified, studyTask, advance: (ms: number) => (now += ms) };
}

const acceptStudy = (s: Awaited<ReturnType<typeof setup>>) => {
  const r = s.engine.accept('study', s.studyTask.id);
  if (!r.ok) throw new Error(r.error);
  return r.quest;
};

describe('study quests with a quiz ready', () => {
  test('the study task is offered as a quiz, not a focus session', async () => {
    const s = await setup();
    expect(s.engine.suggest()).toMatchObject({ type: 'study', taskId: s.studyTask.id, target: 3 });
    expect(s.engine.blocked('study')).toBeNull();
    expect(s.engine.quizReady(s.studyTask.id)).toBe(true);
  });

  test('2 of 3 in time passes: credits study, ticks the task, fires onVerified', async () => {
    const s = await setup();
    const quest = acceptStudy(s);
    const round = s.engine.quizRound(quest.id)!;
    expect(round.questions).toHaveLength(3);

    s.advance(30_000);
    const r = s.engine.answerQuiz(quest.id, [0, 0, 3]);

    expect(r.kind).toBe('passed');
    expect(s.verified).toHaveLength(1);
    expect(s.verified[0].v.method).toBe('quiz');
    expect(s.verified[0].q.type).toBe('study');
    expect(s.verified[0].minted).toBeGreaterThan(0);
    expect(s.store.getState().plan!.tasks[0].done).toBe(1);
    expect(s.engine.blocked('study')).toMatch(/^Next study quest from/);
  });

  test('a miss waits 5 min, allows claim half, and the retry is a fresh round', async () => {
    const s = await setup();
    const quest = acceptStudy(s);
    const first = s.engine.quizRound(quest.id)!;

    const miss = s.engine.answerQuiz(quest.id, [1, 1, 0]);
    expect(miss).toMatchObject({ kind: 'missed', retryAt: expect.any(Number) });
    expect(s.engine.quizRound(quest.id)).toBeNull(); // waiting
    expect(s.engine.answerQuiz(quest.id, [0, 0, 0]).kind).toBe('wait');
    expect(s.engine.progress(quest.id)!.canClaimHalf).toBe(true);

    s.advance(5 * MIN);
    const second = s.engine.quizRound(quest.id)!;
    const seen = first.questions.map((q) => q.q);
    expect(second.questions.some((q) => seen.includes(q.q))).toBe(false);
  });

  test('after a miss the next round starts only when asked, never on its own', async () => {
    const s = await setup();
    const quest = acceptStudy(s);
    s.engine.quizRound(quest.id);
    s.engine.answerQuiz(quest.id, [1, 1, 1]);
    s.advance(6 * MIN);

    expect(s.engine.quizRound(quest.id, { start: false })).toBeNull();
    const fresh = s.engine.quizRound(quest.id)!;
    expect(fresh.startedAt).toBe(s.engine.quizRound(quest.id, { start: false })!.startedAt);
  });

  test('claim half after a miss pays half and marks the task half done', async () => {
    const s = await setup();
    const quest = acceptStudy(s);
    s.engine.quizRound(quest.id);
    s.engine.answerQuiz(quest.id, [1, 1, 1]);

    const r = s.engine.claimHalf(quest.id);

    expect(r.kind).toBe('passed');
    expect(s.store.getState().plan!.tasks[0].done).toBe(0.5);
  });

  test('answering a non-study quest or with no open round is unavailable', async () => {
    const s = await setup();
    const walk = s.engine.accept('fitness');
    if (!walk.ok) throw new Error(walk.error);
    expect(s.engine.answerQuiz(walk.quest.id, [0, 0, 0]).kind).toBe('unavailable');
    expect(s.engine.quizRound(walk.quest.id)).toBeNull();

    const quest = acceptStudy(s);
    expect(s.engine.answerQuiz(quest.id, [0, 0, 0]).kind).toBe('unavailable');
  });
});

describe('falling back to focus', () => {
  test('the server could not make questions → the study task gets a focus quest', async () => {
    const s = await setup({ quizOnline: false });
    expect(s.engine.suggest()).toMatchObject({ type: 'focus', taskId: s.studyTask.id });
    expect(s.engine.blocked('study')).toBe("Quiz questions aren't ready — try phone-down focus");
    expect(s.engine.accept('study', s.studyTask.id).ok).toBe(false);
    expect(s.engine.accept('focus', s.studyTask.id).ok).toBe(true);
  });

  test('a ready quiz still lets the study task be verified by focus', async () => {
    const s = await setup();
    expect(s.engine.accept('focus', s.studyTask.id).ok).toBe(true);
  });

  test('an engine without a quiz bank behaves as before', async () => {
    const s = await setup({ withQuiz: false });
    expect(s.engine.suggest()).toMatchObject({ type: 'focus', taskId: s.studyTask.id });
    expect(s.engine.quizReady(s.studyTask.id)).toBe(false);
  });
});
