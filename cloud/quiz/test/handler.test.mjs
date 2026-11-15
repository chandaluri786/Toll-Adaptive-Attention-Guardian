import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.mjs';

const nine = (tag) => Array.from({ length: 9 }, (_, i) => ({ q: `${tag} ${i}?`, options: ['a', 'b', 'c', 'd'], correct: 0 }));
const silent = { log() {}, error() {} };
const context = { getRemainingTimeInMillis: () => 25_000 };
const post = (body, extra = {}) => ({ routeKey: 'POST /quiz', body: typeof body === 'string' ? body : JSON.stringify(body), isBase64Encoded: false, ...extra });
const json = (res) => JSON.parse(res.body);

const topicFrom = (prompt) => /on: (.*)\n/.exec(prompt)[1];

test('one request with all topics → 9 questions per topic, keyed by topic', async () => {
  const seen = [];
  const handler = createHandler({
    invoke: async (prompt) => {
      seen.push(topicFrom(prompt));
      return JSON.stringify({ questions: nine(topicFrom(prompt)) });
    },
    log: silent,
  });

  const res = await handler(post({ topics: ['Graphs', 'DP'] }), context);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/json');
  const body = json(res);
  assert.deepEqual(Object.keys(body), ['Graphs', 'DP']);
  assert.equal(body.Graphs.length, 9);
  assert.deepEqual(seen.sort(), ['DP', 'Graphs']);
});

test('a topic the model keeps garbling is left out; the others come back', async () => {
  const handler = createHandler({
    invoke: async (prompt) => (topicFrom(prompt) === 'DP' ? 'garbage' : JSON.stringify({ questions: nine('g') })),
    log: silent,
  });
  const res = await handler(post({ topics: ['Graphs', 'DP'] }), context);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(json(res)), ['Graphs']);
});

test('nothing could be made → 502, so the app retries once then falls back to focus', async () => {
  const handler = createHandler({ invoke: async () => 'garbage', log: silent });
  const res = await handler(post({ topics: ['DP'] }), context);
  assert.equal(res.statusCode, 502);
  assert.ok(json(res).error);
});

test('bad bodies are a 400 and never reach the model', async () => {
  let calls = 0;
  const handler = createHandler({
    invoke: async () => {
      calls++;
      return '';
    },
    log: silent,
  });
  for (const body of ['not json', { topics: [] }, { topics: 'DP' }, { topics: ['DP'], walletId: 'x' }, [], 'x'.repeat(5000)]) {
    const res = await handler(post(body), context);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(calls, 0);
});

test('a base64 body is decoded', async () => {
  const handler = createHandler({ invoke: async () => JSON.stringify({ questions: nine('g') }), log: silent });
  const raw = Buffer.from(JSON.stringify({ topics: ['Graphs'] })).toString('base64');
  const res = await handler(post(raw, { isBase64Encoded: true, body: raw }), context);
  assert.equal(res.statusCode, 200);
});

test('topics are never logged (nothing about the user is kept server-side)', async () => {
  const lines = [];
  const log = { log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
  const handler = createHandler({ invoke: async () => 'garbage', log });
  await handler(post({ topics: ['My secret thesis'] }), context);
  assert.ok(lines.every((l) => !l.includes('secret')));
});
