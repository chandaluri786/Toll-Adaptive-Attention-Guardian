// OWNER: B (Spec B — task B10, P1). Pure quiz rules: the question schema the Lambda must return,
// topic clean-up, drawing 3 of the 9, and grading 2 of 3 inside 90 seconds. Planning doc: "The
// quiz, and how it is generated". cloud/quiz/src/schema.mjs mirrors validateQuestion server-side.

export const QUIZ_POOL_SIZE = 9;
export const QUIZ_DRAW = 3;
export const QUIZ_PASS = 2;
export const QUIZ_SECONDS = 90;
/** The tap that lands on 0:00 (and the round trip to grade it) still counts. */
export const QUIZ_GRACE_MS = 5_000;
export const MAX_TOPICS = 7;
export const MAX_TOPIC_CHARS = 80;
const OPTIONS = 4;
const MAX_QUESTION_CHARS = 400;
const MAX_OPTION_CHARS = 200;

export type QuizQuestion = { q: string; options: [string, string, string, string]; correct: 0 | 1 | 2 | 3 };
/** What the quiz screen shows: the answer stays out of the view. */
export type QuizPrompt = { q: string; options: readonly string[] };

const text = (x: unknown, max: number): string | null => {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  return t.length > 0 && t.length <= max ? t : null;
};

/** One question: non-empty text, exactly 4 distinct non-empty options, correct an integer 0–3. */
export function validateQuestion(x: unknown): QuizQuestion | null {
  if (typeof x !== 'object' || x === null) return null;
  const { q, options, correct } = x as Record<string, unknown>;
  const question = text(q, MAX_QUESTION_CHARS);
  if (!question || !Array.isArray(options) || options.length !== OPTIONS) return null;
  const opts = options.map((o) => text(o, MAX_OPTION_CHARS));
  if (opts.some((o) => o === null)) return null;
  if (new Set(opts.map((o) => o!.toLowerCase())).size !== OPTIONS) return null;
  if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0 || correct >= OPTIONS) return null;
  return { q: question, options: opts as QuizQuestion['options'], correct: correct as QuizQuestion['correct'] };
}

/** Exactly nine valid questions (bare array or the prompt's `{questions: [...]}`), else null. */
export function validatePool(x: unknown): QuizQuestion[] | null {
  const list = Array.isArray(x) ? x : typeof x === 'object' && x !== null ? (x as { questions?: unknown }).questions : null;
  if (!Array.isArray(list) || list.length !== QUIZ_POOL_SIZE) return null;
  const pool = list.map(validateQuestion);
  return pool.every((q) => q !== null) ? (pool as QuizQuestion[]) : null;
}

export function cleanTopic(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_CHARS).trim();
  return t.length > 0 ? t : null;
}

/** Cache key for a topic: case and spacing don't make a new quiz. */
export const topicKey = (topic: string): string => (cleanTopic(topic) ?? '').toLowerCase();

/** Clean, dedupe (by key) and cap the day's topics. */
export function cleanTopics(raws: unknown): string[] {
  if (!Array.isArray(raws)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const t = cleanTopic(raw);
    if (!t || seen.has(topicKey(t))) continue;
    seen.add(topicKey(t));
    out.push(t);
    if (out.length === MAX_TOPICS) break;
  }
  return out;
}

/** Draw 3 indices; a retry avoids everything already seen, or at least the last round's three. */
export function drawRound(poolSize: number, seen: readonly number[], rng: () => number): number[] {
  const all = Array.from({ length: poolSize }, (_, i) => i);
  const unseen = all.filter((i) => !seen.includes(i));
  const lastRound = seen.slice(-QUIZ_DRAW);
  const candidates = unseen.length >= QUIZ_DRAW ? unseen : all.filter((i) => !lastRound.includes(i));
  const pick = [...candidates];
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  return pick.slice(0, QUIZ_DRAW);
}

export type Grade = { correct: number; answered: number; inTime: boolean; pass: boolean };

const isAnswer = (a: unknown): a is number => typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < OPTIONS;

/** -1 (or anything that isn't 0–3) = unanswered. Past 90 s (+ grace) nothing counts. */
export function gradeAnswers(pool: readonly QuizQuestion[], drawn: readonly number[], answers: readonly unknown[], elapsedMs: number): Grade {
  const inTime = elapsedMs <= QUIZ_SECONDS * 1000 + QUIZ_GRACE_MS;
  const given = drawn.map((_, i) => (Array.isArray(answers) ? answers[i] : undefined));
  const answered = given.filter(isAnswer).length;
  const correct = inTime ? drawn.filter((qi, i) => isAnswer(given[i]) && pool[qi]?.correct === given[i]).length : 0;
  return { correct, answered, inTime, pass: correct >= QUIZ_PASS };
}
