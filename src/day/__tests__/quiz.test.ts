import { cleanTopic, cleanTopics, drawRound, gradeAnswers, QUIZ_DRAW, QUIZ_POOL_SIZE, QUIZ_SECONDS, topicKey, validatePool, validateQuestion, type QuizQuestion } from '../quiz';

const question = (n: number, correct = 0): QuizQuestion => ({ q: `Question ${n}?`, options: ['a', 'b', 'c', 'd'], correct: correct as QuizQuestion['correct'] });
const pool = (size = QUIZ_POOL_SIZE) => Array.from({ length: size }, (_, i) => question(i, i % 4));

describe('validateQuestion', () => {
  test('accepts a question with 4 options and correct in 0–3', () => {
    expect(validateQuestion({ q: ' What is BFS? ', options: ['a', 'b', 'c', 'd'], correct: 3 })).toEqual({ q: 'What is BFS?', options: ['a', 'b', 'c', 'd'], correct: 3 });
  });

  test.each([
    ['three options', { q: 'Q', options: ['a', 'b', 'c'], correct: 0 }],
    ['five options', { q: 'Q', options: ['a', 'b', 'c', 'd', 'e'], correct: 0 }],
    ['correct out of range', { q: 'Q', options: ['a', 'b', 'c', 'd'], correct: 4 }],
    ['correct not an integer', { q: 'Q', options: ['a', 'b', 'c', 'd'], correct: 1.5 }],
    ['empty question', { q: '  ', options: ['a', 'b', 'c', 'd'], correct: 0 }],
    ['empty option', { q: 'Q', options: ['a', '', 'c', 'd'], correct: 0 }],
    ['duplicate options', { q: 'Q', options: ['a', 'a', 'c', 'd'], correct: 0 }],
    ['non-string option', { q: 'Q', options: ['a', 2, 'c', 'd'], correct: 0 }],
    ['not an object', 'Q'],
    ['null', null],
  ])('rejects %s', (_label, x) => {
    expect(validateQuestion(x)).toBeNull();
  });

  test('rejects absurdly long text', () => {
    expect(validateQuestion({ q: 'x'.repeat(1000), options: ['a', 'b', 'c', 'd'], correct: 0 })).toBeNull();
  });
});

describe('validatePool', () => {
  test('accepts exactly nine valid questions, bare or wrapped in {questions}', () => {
    expect(validatePool(pool())).toHaveLength(9);
    expect(validatePool({ questions: pool() })).toHaveLength(9);
  });

  test('rejects eight or ten questions', () => {
    expect(validatePool(pool(8))).toBeNull();
    expect(validatePool(pool(10))).toBeNull();
  });

  test('rejects the whole pool when one question is malformed', () => {
    const bad = [...pool(8), { q: 'Q', options: ['a', 'b'], correct: 0 }];
    expect(validatePool(bad)).toBeNull();
  });
});

describe('topics', () => {
  test('cleanTopic trims and collapses spaces; empty → null', () => {
    expect(cleanTopic('  Graph   algorithms ')).toBe('Graph algorithms');
    expect(cleanTopic('   ')).toBeNull();
    expect(cleanTopic(42 as unknown as string)).toBeNull();
  });

  test('cleanTopic caps the length at 80 characters', () => {
    expect(cleanTopic('a'.repeat(200))).toHaveLength(80);
  });

  test('topicKey ignores case and spacing', () => {
    expect(topicKey(' Graph  Algorithms')).toBe(topicKey('graph algorithms'));
  });

  test('cleanTopics dedupes by key and keeps at most seven', () => {
    const raw = ['Graphs', 'graphs ', 'DP', '', 'a', 'b', 'c', 'd', 'e', 'f'];
    expect(cleanTopics(raw)).toEqual(['Graphs', 'DP', 'a', 'b', 'c', 'd', 'e']);
  });
});

describe('drawRound', () => {
  const seq = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  test('draws three distinct questions from the nine', () => {
    const drawn = drawRound(QUIZ_POOL_SIZE, [], Math.random);
    expect(drawn).toHaveLength(QUIZ_DRAW);
    expect(new Set(drawn).size).toBe(QUIZ_DRAW);
    drawn.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    drawn.forEach((i) => expect(i).toBeLessThan(QUIZ_POOL_SIZE));
  });

  test('a retry draws a different three', () => {
    for (let n = 0; n < 50; n++) {
      const first = drawRound(QUIZ_POOL_SIZE, [], Math.random);
      const second = drawRound(QUIZ_POOL_SIZE, first, Math.random);
      expect(second.filter((i) => first.includes(i))).toEqual([]);
    }
  });

  test('when too few unseen questions are left, it still draws three new to the last round', () => {
    const drawn = drawRound(QUIZ_POOL_SIZE, [0, 1, 2, 3, 4, 5, 6, 7], seq([0.1, 0.5, 0.9]));
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
  });
});

describe('gradeAnswers', () => {
  const p = pool(); // correct = index % 4
  const drawn = [0, 5, 7]; // correct answers 0, 1, 3

  test('passes at 2 of 3 inside 90 seconds', () => {
    expect(gradeAnswers(p, drawn, [0, 1, 0], 30_000)).toEqual({ correct: 2, answered: 3, inTime: true, pass: true });
  });

  test('1 of 3 is not a pass', () => {
    expect(gradeAnswers(p, drawn, [0, 0, 0], 30_000).pass).toBe(false);
  });

  test('unanswered (-1) counts as wrong', () => {
    expect(gradeAnswers(p, drawn, [0, -1, -1], 30_000)).toEqual({ correct: 1, answered: 1, inTime: true, pass: false });
  });

  test('answers well past 90 seconds do not count', () => {
    const r = gradeAnswers(p, drawn, [0, 1, 3], QUIZ_SECONDS * 1000 + 30_000);
    expect(r).toEqual({ correct: 0, answered: 3, inTime: false, pass: false });
  });

  test('a few seconds of grace for the tap that lands on 0:00', () => {
    expect(gradeAnswers(p, drawn, [0, 1, 3], QUIZ_SECONDS * 1000 + 2_000).pass).toBe(true);
  });

  test('garbage answers are treated as unanswered', () => {
    expect(gradeAnswers(p, drawn, ['x', 9, 1.5] as unknown as number[], 1_000)).toEqual({ correct: 0, answered: 0, inTime: true, pass: false });
  });
});
