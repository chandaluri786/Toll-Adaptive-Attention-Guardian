// OWNER: B (B10). Pure quiz generation: the planning doc's prompt, one Bedrock call per topic, a
// schema check (mirrors src/day/quiz.ts on the phone), one retry on malformed output, and an
// option shuffle so the right answer isn't always where the model likes to put it.

export const POOL_SIZE = 9;
export const MAX_TOPICS = 7;
export const MAX_TOPIC_CHARS = 80;
const OPTIONS = 4;
const MAX_QUESTION_CHARS = 400;
const MAX_OPTION_CHARS = 200;
const BANNED_OPTION = /\b(all|none) of the above\b/i;

/** Verbatim from the planning doc ("The quiz, and how it is generated"). */
export const buildPrompt = (topic) =>
  [
    `Generate 9 multiple-choice questions on: ${topic}`,
    'Difficulty: easy to medium — someone who studied this',
    'today should answer correctly in under 30 seconds.',
    'Return ONLY valid JSON, no prose:',
    '{"questions":[{"q":"...","options":["a","b","c","d"],',
    '"correct":0}]}',
    'Rules: exactly 4 options, exactly one correct,',
    'distractors must be plausible, no "all of the above".',
  ].join('\n');

const clean = (x, max) => {
  if (typeof x !== 'string') return null;
  const t = x.replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= max ? t : null;
};

/** 1–7 topics, each 1–80 chars once trimmed; duplicates (by case) dropped. */
export function cleanTopics(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TOPICS) return { ok: false, error: `topics must be 1–${MAX_TOPICS} strings` };
  const topics = [];
  const seen = new Set();
  for (const t of raw) {
    const c = clean(t, MAX_TOPIC_CHARS);
    if (!c) return { ok: false, error: `each topic must be 1–${MAX_TOPIC_CHARS} characters` };
    if (seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    topics.push(c);
  }
  return { ok: true, topics };
}

function validateQuestion(x) {
  if (typeof x !== 'object' || x === null) return null;
  const q = clean(x.q, MAX_QUESTION_CHARS);
  if (!q || !Array.isArray(x.options) || x.options.length !== OPTIONS) return null;
  const options = x.options.map((o) => clean(o, MAX_OPTION_CHARS));
  if (options.some((o) => !o || BANNED_OPTION.test(o))) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== OPTIONS) return null;
  if (!Number.isInteger(x.correct) || x.correct < 0 || x.correct >= OPTIONS) return null;
  return { q, options, correct: x.correct };
}

/** The model's text → 9 valid questions, or null (malformed JSON, wrong shape, banned options). */
export function parseQuestions(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = parsed?.questions;
  if (!Array.isArray(list) || list.length !== POOL_SIZE) return null;
  const qs = list.map(validateQuestion);
  return qs.every(Boolean) ? qs : null;
}

export function shuffleOptions(question, rng) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { q: question.q, options: order.map((i) => question.options[i]), correct: order.indexOf(question.correct) };
}

/** One topic → 9 questions; a malformed answer (or model error) is retried once if time allows. */
export async function generateForTopic(topic, { invoke, rng = Math.random, canRetry, onError = () => {} }) {
  const prompt = buildPrompt(topic);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && !canRetry()) break;
    let text;
    try {
      text = await invoke(prompt);
    } catch (e) {
      onError(e);
      text = null;
    }
    const qs = parseQuestions(text);
    if (qs) return qs.map((q) => shuffleOptions(q, rng));
  }
  return null;
}
