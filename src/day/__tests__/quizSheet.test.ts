import type { Quest } from '../../contracts';
import type { QuizRound } from '../quiz-bank';
import { answerAt, quizOver, quizRetryPhase, quizView, studyStep, submission } from '../quiz-sheet';

const T0 = new Date(2026, 10, 16, 10, 0).getTime();
const round: QuizRound = {
  questId: 'q1',
  topic: 'Graph algorithms',
  questions: [
    { q: 'What does BFS use?', options: ['Queue', 'Stack', 'Heap', 'Set'] },
    { q: 'DFS uses?', options: ['Queue', 'Stack', 'Heap', 'Set'] },
    { q: 'Dijkstra needs?', options: ['Negative edges', 'Non-negative edges', 'A DAG', 'Nothing'] },
  ],
  startedAt: T0,
  endsAt: T0 + 90_000,
};
const quest: Quest = { id: 'q1', type: 'study', target: 3, acceptedAt: T0, expiresAt: T0 + 4 * 3_600_000, baseline: {}, status: 'active' };

describe('quizView', () => {
  test('first question, full clock', () => {
    const v = quizView(round, [], T0, 20);
    expect(v).toMatchObject({
      title: 'Quiz',
      topic: 'Graph algorithms',
      counter: 'Question 1 of 3',
      timeLeft: '1:30',
      fraction: 1,
      question: round.questions[0],
      pays: "Pays 20 min · 2 of 3 to pass",
    });
  });

  test('after two answers with 30 s gone', () => {
    const v = quizView(round, [0, 1], T0 + 30_000, 20);
    expect(v.counter).toBe('Question 3 of 3');
    expect(v.timeLeft).toBe('1:00');
    expect(v.fraction).toBeCloseTo(2 / 3);
    expect(v.question).toBe(round.questions[2]);
  });

  test('past the end the clock reads 0:00 and the bar is empty', () => {
    const v = quizView(round, [0], T0 + 120_000, 20);
    expect(v.timeLeft).toBe('0:00');
    expect(v.fraction).toBe(0);
  });
});

describe('answering', () => {
  test('answerAt appends without mutating', () => {
    const before = [0];
    const after = answerAt(before, 2);
    expect(after).toEqual([0, 2]);
    expect(before).toEqual([0]);
  });

  test('the quiz is over after three answers or when time runs out', () => {
    expect(quizOver(round, [0, 1], T0 + 10_000)).toBe(false);
    expect(quizOver(round, [0, 1, 2], T0 + 10_000)).toBe(true);
    expect(quizOver(round, [0], T0 + 90_000)).toBe(true);
  });

  test('submission pads unanswered questions with -1', () => {
    expect(submission([2])).toEqual([2, -1, -1]);
    expect(submission([0, 1, 2])).toEqual([0, 1, 2]);
  });
});

describe('studyStep', () => {
  test('an open round shows the quiz', () => {
    expect(studyStep({ open: true, missed: true })).toBe('quiz');
  });
  test('a fresh quest starts its first round', () => {
    expect(studyStep({ open: false, missed: false })).toBe('start');
  });
  test('after a miss with no open round, show not-yet (Try again starts the next one)', () => {
    expect(studyStep({ open: false, missed: true })).toBe('notYet');
  });
});

describe('quizRetryPhase', () => {
  const notYet = { kind: 'notYet' as const, quest, reason: '1 of 3 right — 2 needed.', retryAt: T0 + 300_000 };

  test('stays put while the 5 minutes run', () => {
    expect(quizRetryPhase(notYet, T0 + 60_000)).toBe(notYet);
  });

  test('then opens a fresh round', () => {
    expect(quizRetryPhase(notYet, T0 + 300_000)).toEqual({ kind: 'active', quest, notice: null });
  });
});
