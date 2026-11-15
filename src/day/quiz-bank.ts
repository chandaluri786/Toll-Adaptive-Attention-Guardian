// OWNER: B (Spec B — task B10, P1). The phone's quiz bank: question pools per study topic, fetched
// in one request once the day is planned and stored under `day:quiz` so quizzes work offline; and
// the open round per study quest (3 of 9, 90 s, pass at 2; a retry draws a different 3). A topic
// the server couldn't make is "not ready" — the quest engine then verifies that task by focus.
import type { Quest, Unsub, Verdict } from '../contracts';
import { createEmitter, HOUR, MIN } from '../shared/emitter';
import { readJson, type KV } from './kv';
import { todaysPlan, type PlannerState } from './planner';
import { cleanTopic, drawRound, gradeAnswers, QUIZ_DRAW, QUIZ_PASS, QUIZ_POOL_SIZE, QUIZ_SECONDS, topicKey, validatePool, type QuizPrompt, type QuizQuestion } from './quiz';
import type { PoolResult } from './quiz-client';

export const QUIZ_KEY = 'quiz';
/** A topic the server couldn't make is asked for again after this long (e.g. back online). */
export const FAILED_RETRY_MS = 30 * MIN;
const POOL_KEEP_MS = 7 * 24 * HOUR;
const ROUND_KEEP_MS = 24 * HOUR;

export type QuizRequest = (topics: string[]) => Promise<PoolResult>;
export type QuizBankDeps = {
  kv: KV;
  now: () => number;
  planner: { getState(): PlannerState };
  /** null = no quiz server configured: every study task falls back to focus. */
  request: QuizRequest | null;
  rng?: () => number;
};
export type QuizRound = { questId: string; topic: string; questions: QuizPrompt[]; startedAt: number; endsAt: number };
export type QuizBank = {
  /** Fetch pools for today's study topics that aren't stored yet, in one request. Never rejects. */
  sync(): Promise<void>;
  /** A quiz is ready for this plan task (or, with no id, for any of today's study tasks). */
  ready(taskId?: string): boolean;
  /** The open round for a study quest, or a fresh 3 if the last one was graded. null = no questions. */
  round(quest: Quest): QuizRound | null;
  /** Grade the open round and close it. null = no open round. */
  grade(quest: Quest, answers: readonly number[]): Verdict | null;
  subscribe(fn: () => void): Unsub;
};

type StoredPool = { topic: string; questions: QuizQuestion[]; at: number };
type StoredRound = { key: string; topic: string; drawn: number[]; seen: number[]; startedAt: number; open: boolean };
type BankState = { pools: Record<string, StoredPool>; failed: Record<string, number>; rounds: Record<string, StoredRound> };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isIndexList = (x: unknown): x is number[] => Array.isArray(x) && x.every((i) => Number.isInteger(i) && i >= 0 && i < QUIZ_POOL_SIZE);

function validEntries<T>(x: unknown, check: (v: unknown) => T | null): Record<string, T> {
  if (!isObj(x)) return {};
  return Object.fromEntries(Object.entries(x).flatMap(([k, v]) => {
    const ok = check(v);
    return ok === null ? [] : [[k, ok]];
  }));
}

const checkPool = (v: unknown): StoredPool | null => {
  if (!isObj(v) || typeof v.topic !== 'string' || typeof v.at !== 'number') return null;
  const questions = validatePool(v.questions);
  return questions ? { topic: v.topic, questions, at: v.at } : null;
};
const checkRound = (v: unknown): StoredRound | null =>
  isObj(v) && typeof v.key === 'string' && typeof v.topic === 'string' && isIndexList(v.drawn) && v.drawn.length === QUIZ_DRAW && isIndexList(v.seen) && typeof v.startedAt === 'number' && typeof v.open === 'boolean'
    ? { key: v.key, topic: v.topic, drawn: v.drawn, seen: v.seen, startedAt: v.startedAt, open: v.open }
    : null;
const checkTime = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function loadState(raw: unknown): BankState {
  const x = isObj(raw) ? raw : {};
  return { pools: validEntries(x.pools, checkPool), failed: validEntries(x.failed, checkTime), rounds: validEntries(x.rounds, checkRound) };
}

function prune(s: BankState, now: number): BankState {
  const keep = <T>(rec: Record<string, T>, fresh: (v: T) => boolean) => Object.fromEntries(Object.entries(rec).filter(([, v]) => fresh(v)));
  return {
    pools: keep(s.pools, (p) => now - p.at < POOL_KEEP_MS),
    failed: keep(s.failed, (t) => now - t < FAILED_RETRY_MS),
    rounds: keep(s.rounds, (r) => now - r.startedAt < ROUND_KEEP_MS),
  };
}

function verdictFor(questId: string, correct: number, inTime: boolean): Verdict {
  const pass = correct >= QUIZ_PASS;
  const reason = !inTime ? 'Time ran out — 90 seconds for all three' : pass ? `${correct} of ${QUIZ_DRAW} right` : `${correct} of ${QUIZ_DRAW} right — ${QUIZ_PASS} needed`;
  return { questId, pass, method: 'quiz', reason, measured: `${correct} of ${QUIZ_DRAW} right`, flags: [] };
}

export function createQuizBank(deps: QuizBankDeps): QuizBank {
  const changes = createEmitter<void>();
  const rng = deps.rng ?? Math.random;
  let state = loadState(readJson(deps.kv, QUIZ_KEY));
  let inflight: Promise<void> | null = null;

  const save = (next: BankState) => {
    state = prune(next, deps.now());
    deps.kv.set(QUIZ_KEY, JSON.stringify(state));
    changes.emit();
  };

  const studyTasks = () => (todaysPlan(deps.planner.getState(), deps.now())?.tasks ?? []).filter((t) => t.type === 'study' && cleanTopic(t.topic ?? ''));
  const hasPool = (topic: string) => topicKey(topic) in state.pools;

  /** The topic a study quest quizzes on: its task's, or the first of today's with questions. */
  function topicFor(quest: Quest): string | null {
    const tasks = studyTasks();
    const task = quest.taskId ? tasks.find((t) => t.id === quest.taskId) : tasks.find((t) => hasPool(t.topic!));
    return task && hasPool(task.topic!) ? task.topic! : null;
  }

  async function fetchMissing(request: QuizRequest, topics: string[]) {
    let result: PoolResult;
    try {
      result = await request(topics);
    } catch {
      result = { pools: {}, missing: topics };
    }
    const t = deps.now();
    const got = Object.entries(result.pools).flatMap(([topic, qs]) => {
      const questions = validatePool(qs);
      return questions ? [[topicKey(topic), { topic, questions, at: t }] as const] : [];
    });
    const gotKeys = new Set(got.map(([k]) => k));
    const failed = topics.filter((x) => !gotKeys.has(topicKey(x))).map((x) => [topicKey(x), t] as const);
    save({ ...state, pools: { ...state.pools, ...Object.fromEntries(got) }, failed: { ...state.failed, ...Object.fromEntries(failed) } });
  }

  function sync(): Promise<void> {
    if (inflight) return inflight;
    const request = deps.request;
    if (!request) return Promise.resolve();
    const now = deps.now();
    const wanted = studyTasks().map((t) => cleanTopic(t.topic!)!);
    const missing = wanted.filter((t, i) => {
      const key = topicKey(t);
      const failedAt = state.failed[key];
      const recentlyFailed = failedAt !== undefined && now - failedAt < FAILED_RETRY_MS;
      return !hasPool(t) && !recentlyFailed && wanted.findIndex((w) => topicKey(w) === key) === i;
    });
    if (missing.length === 0) return Promise.resolve();
    inflight = fetchMissing(request, missing).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function ready(taskId?: string): boolean {
    const tasks = studyTasks();
    if (taskId === undefined) return tasks.some((t) => hasPool(t.topic!));
    const task = tasks.find((t) => t.id === taskId);
    return !!task && hasPool(task.topic!);
  }

  const view = (questId: string, r: StoredRound): QuizRound | null => {
    const pool = state.pools[r.key];
    if (!pool) return null;
    const questions = r.drawn.map((i) => ({ q: pool.questions[i].q, options: [...pool.questions[i].options] }));
    return { questId, topic: r.topic, questions, startedAt: r.startedAt, endsAt: r.startedAt + QUIZ_SECONDS * 1000 };
  };

  function round(quest: Quest): QuizRound | null {
    const prev = state.rounds[quest.id];
    if (prev?.open) return view(quest.id, prev);
    const topic = prev && state.pools[prev.key] ? prev.topic : topicFor(quest);
    if (!topic) return null;
    const seen = prev ? [...prev.seen, ...prev.drawn] : [];
    const next: StoredRound = { key: topicKey(topic), topic, drawn: drawRound(QUIZ_POOL_SIZE, seen, rng), seen, startedAt: deps.now(), open: true };
    save({ ...state, rounds: { ...state.rounds, [quest.id]: next } });
    return view(quest.id, next);
  }

  function grade(quest: Quest, answers: readonly number[]): Verdict | null {
    const r = state.rounds[quest.id];
    const pool = r ? state.pools[r.key] : undefined;
    if (!r?.open || !pool) return null;
    const g = gradeAnswers(pool.questions, r.drawn, answers, deps.now() - r.startedAt);
    save({ ...state, rounds: { ...state.rounds, [quest.id]: { ...r, open: false } } });
    return verdictFor(quest.id, g.correct, g.inTime);
  }

  return { sync, ready, round, grade, subscribe: (fn) => changes.on(fn) };
}
