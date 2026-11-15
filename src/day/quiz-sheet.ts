// OWNER: B (task B10). The quiz step of the quest sheet, pure: one question at a time against a
// 90-second clock; answers are submitted after the third tap or when the clock runs out.
import { formatMinSec } from './format';
import { QUIZ_DRAW, QUIZ_PASS, type QuizPrompt } from './quiz';
import type { QuizRound } from './quiz-bank';
import type { Phase } from './quest-sheet';
import { QUEST_COPY } from './quest-copy';

export type QuizView = {
  title: string;
  topic: string;
  counter: string;
  timeLeft: string;
  /** Share of the 90 s still left (the bar empties as time runs). */
  fraction: number;
  question: QuizPrompt | null;
  pays: string;
};

const UNANSWERED = -1;

export function quizView(round: QuizRound, answers: readonly number[], now: number, pay: number): QuizView {
  const total = round.endsAt - round.startedAt;
  const left = Math.max(0, round.endsAt - now);
  const index = Math.min(answers.length, round.questions.length - 1);
  return {
    title: QUEST_COPY.study.activeTitle,
    topic: round.topic,
    counter: `Question ${index + 1} of ${round.questions.length}`,
    timeLeft: formatMinSec(left),
    fraction: total > 0 ? Math.min(1, left / total) : 0,
    question: round.questions[index] ?? null,
    pays: `Pays ${pay} min · ${QUIZ_PASS} of ${QUIZ_DRAW} to pass`,
  };
}

export const answerAt = (answers: readonly number[], option: number): number[] => [...answers, option];

export const quizOver = (round: QuizRound, answers: readonly number[], now: number): boolean => answers.length >= round.questions.length || now >= round.endsAt;

/** What goes to the engine: one entry per question, -1 where time ran out first. */
export const submission = (answers: readonly number[]): number[] => Array.from({ length: QUIZ_DRAW }, (_, i) => answers[i] ?? UNANSWERED);

/** "Try again" on a missed quiz: a fresh round once the 5 minutes are up. */
export function quizRetryPhase(phase: Extract<Phase, { kind: 'notYet' }>, now: number): Phase {
  if (phase.retryAt !== null && now < phase.retryAt) return phase;
  return { kind: 'active', quest: phase.quest, notice: null };
}
