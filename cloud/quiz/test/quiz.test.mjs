import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, cleanTopics, generateForTopic, parseQuestions, shuffleOptions } from '../src/quiz.mjs';

const question = (i, extra = {}) => ({ q: `Q${i}?`, options: ['a', 'b', 'c', 'd'], correct: i % 4, ...extra });
const nine = (extra) => Array.from({ length: 9 }, (_, i) => question(i, extra));
const keepOrder = () => 0.999; // shuffle leaves the order unchanged

test('the prompt is the planning doc prompt, once per topic', () => {
  const p = buildPrompt('Graph algorithms');
  assert.match(p, /^Generate 9 multiple-choice questions on: Graph algorithms\n/);
  assert.match(p, /Return ONLY valid JSON, no prose:/);
  assert.match(p, /no "all of the above"\.$/);
});

test('cleanTopics: 1–7 non-empty strings, trimmed, deduped, ≤ 80 chars', () => {
  assert.deepEqual(cleanTopics([' Graphs ', 'graphs', 'DP']), { ok: true, topics: ['Graphs', 'DP'] });
  assert.equal(cleanTopics([]).ok, false);
  assert.equal(cleanTopics(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).ok, false);
  assert.equal(cleanTopics(['ok', 5]).ok, false);
  assert.equal(cleanTopics(['   ']).ok, false);
  assert.equal(cleanTopics('Graphs').ok, false);
  assert.equal(cleanTopics(['x'.repeat(81)]).ok, false);
});

test('parseQuestions accepts the JSON object, also inside a code fence', () => {
  assert.equal(parseQuestions(JSON.stringify({ questions: nine() })).length, 9);
  assert.equal(parseQuestions('```json\n' + JSON.stringify({ questions: nine() }) + '\n```').length, 9);
});

test('parseQuestions rejects prose, wrong counts, bad options and "all of the above"', () => {
  assert.equal(parseQuestions('Sure! Here are some questions.'), null);
  assert.equal(parseQuestions(JSON.stringify({ questions: nine().slice(0, 8) })), null);
  assert.equal(parseQuestions(JSON.stringify({ questions: nine({ options: ['a', 'b', 'c'] }) })), null);
  assert.equal(parseQuestions(JSON.stringify({ questions: nine({ correct: 4 }) })), null);
  const allOfAbove = nine();
  allOfAbove[3] = { ...allOfAbove[3], options: ['a', 'b', 'c', 'All of the above'] };
  assert.equal(parseQuestions(JSON.stringify({ questions: allOfAbove })), null);
});

test('shuffleOptions moves the options but keeps the right answer right', () => {
  const q = { q: 'Q?', options: ['right', 'w1', 'w2', 'w3'], correct: 0 };
  for (let i = 0; i < 20; i++) {
    const s = shuffleOptions(q, Math.random);
    assert.equal(s.options[s.correct], 'right');
    assert.deepEqual([...s.options].sort(), ['right', 'w1', 'w2', 'w3']);
  }
});

test('generateForTopic: one call when the model answers well', async () => {
  const prompts = [];
  const invoke = async (prompt) => {
    prompts.push(prompt);
    return JSON.stringify({ questions: nine() });
  };
  const qs = await generateForTopic('DP', { invoke, rng: keepOrder, canRetry: () => true });
  assert.equal(qs.length, 9);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /on: DP\n/);
});

test('generateForTopic: malformed JSON is retried once, then gives up with null', async () => {
  let calls = 0;
  const invoke = async () => {
    calls++;
    return calls === 1 ? '{"questions": [' : JSON.stringify({ questions: nine() });
  };
  assert.equal((await generateForTopic('DP', { invoke, rng: keepOrder, canRetry: () => true })).length, 9);
  assert.equal(calls, 2);

  let bad = 0;
  const alwaysBad = async () => {
    bad++;
    return 'nope';
  };
  assert.equal(await generateForTopic('DP', { invoke: alwaysBad, rng: keepOrder, canRetry: () => true }), null);
  assert.equal(bad, 2);
});

test('generateForTopic: no retry when time is short; a thrown model error counts as a miss', async () => {
  let calls = 0;
  const invoke = async () => {
    calls++;
    throw new Error('ThrottlingException');
  };
  assert.equal(await generateForTopic('DP', { invoke, rng: keepOrder, canRetry: () => false }), null);
  assert.equal(calls, 1);
});
