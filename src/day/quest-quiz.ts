// OWNER: B (Spec B — task B10, P1). The quest engine's quiz actions, kept apart from quests.ts:
// open the round for a live study quest, and grade it (pass → credit, miss → retry in 5 min with
// a fresh 3, claim half as usual). The engine hands in its own gate and result paths.
import type { Verdict } from '../contracts';
import type { QuizBank, QuizRound } from './quiz-bank';
import type { QuestRecord } from './quest-state';
import type { VerifyResult } from './quests';

export type QuizPort = Pick<QuizBank, 'ready' | 'round' | 'grade'>;

type QuizActionDeps = {
  quiz: QuizPort | undefined;
  now: () => number;
  /** The engine's "still running?" gate: the record, or friendly copy why not. */
  live: (questId: string) => QuestRecord | string;
  pass: (r: QuestRecord, v: Verdict) => VerifyResult;
  miss: (r: QuestRecord, v: Verdict) => VerifyResult;
};

export type QuizActions = {
  /** A quiz is ready for this plan task (no id: for any of today's study tasks). */
  quizReady(taskId?: string): boolean;
  /** The open round of a live study quest, starting the next one unless start: false. null while waiting out a miss or with no questions. */
  quizRound(questId: string, opts?: { start?: boolean }): QuizRound | null;
  /** Grade the open round: 2 of 3 in 90 s passes. */
  answerQuiz(questId: string, answers: readonly number[]): VerifyResult;
};

const waiting = (r: QuestRecord, now: number) => r.retryAt !== null && now < r.retryAt;

export function createQuizActions(deps: QuizActionDeps): QuizActions {
  return {
    quizReady: (taskId) => deps.quiz?.ready(taskId) ?? false,
    quizRound(questId, opts = {}) {
      const r = deps.live(questId);
      if (typeof r === 'string' || r.quest.type !== 'study' || !deps.quiz || waiting(r, deps.now())) return null;
      return deps.quiz.round(r.quest, { peek: opts.start === false });
    },
    answerQuiz(questId, answers) {
      const r = deps.live(questId);
      if (typeof r === 'string') return { kind: 'unavailable', error: r };
      if (r.quest.type !== 'study' || !deps.quiz) return { kind: 'unavailable', error: 'This quest has no quiz' };
      if (waiting(r, deps.now()) && r.lastVerdict) return { kind: 'wait', verdict: r.lastVerdict, retryAt: r.retryAt! };
      const v = deps.quiz.grade(r.quest, answers);
      if (!v) return { kind: 'unavailable', error: 'Open the quiz first' };
      return v.pass ? deps.pass(r, v) : deps.miss(r, v);
    },
  };
}
