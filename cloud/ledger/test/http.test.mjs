import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/http.mjs';
import { createMemoryStore } from './memoryStore.mjs';
import { createMemoryPairStore } from './memoryPairStore.mjs';

const WALLET = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';
const silent = { error() {} };
const post = (events) => ({ routeKey: 'POST /events', body: JSON.stringify({ events }), isBase64Encoded: false });
const getBalance = (walletId) => ({ routeKey: 'GET /balance', queryStringParameters: walletId === undefined ? undefined : { walletId } });
const json = (res) => JSON.parse(res.body);

test('POST /events then GET /balance: a duplicate post is counted once', async () => {
  const route = createRouter({ store: createMemoryStore(), log: silent });
  const batch = [{ id: 'spend-1', walletId: WALLET, deltaMinutes: -5, at: 1763145600000 }];

  const first = await route(post(batch));
  const second = await route(post(batch));
  const balance = await route(getBalance(WALLET));

  assert.equal(first.statusCode, 200);
  assert.deepEqual(json(first), { accepted: 1, duplicates: 0 });
  assert.deepEqual(json(second), { accepted: 0, duplicates: 1 });
  assert.deepEqual(json(balance), { walletId: WALLET, balanceMinutes: -5 });
  assert.equal(balance.headers['content-type'], 'application/json');
});

test('a base64-encoded body is decoded', async () => {
  const route = createRouter({ store: createMemoryStore(), log: silent });
  const raw = JSON.stringify({ events: [{ id: 'q', walletId: WALLET, deltaMinutes: 3, at: 1 }] });
  const res = await route({ routeKey: 'POST /events', body: Buffer.from(raw).toString('base64'), isBase64Encoded: true });
  assert.equal(res.statusCode, 200);
});

test('malformed input gets a 400 and nothing is stored', async () => {
  const store = createMemoryStore();
  const route = createRouter({ store, log: silent });
  const res = await route(post([{ id: 'q', walletId: WALLET, deltaMinutes: 'lots', at: 1 }]));
  assert.equal(res.statusCode, 400);
  assert.match(json(res).error, /deltaMinutes/);
  assert.equal(store.rows.size, 0);
});

test('GET /balance without a valid walletId is a 400', async () => {
  const route = createRouter({ store: createMemoryStore(), log: silent });
  assert.equal((await route(getBalance(undefined))).statusCode, 400);
  assert.equal((await route(getBalance('nope'))).statusCode, 400);
});

const postJson = (routeKey, payload) => ({ routeKey, body: JSON.stringify(payload), isBase64Encoded: false });
const pairRouter = (now = () => 1763145600000) =>
  createRouter({ store: createMemoryStore(), pairStore: createMemoryPairStore(), now, log: silent });

test('POST /pair then POST /pair/claim hands over the wallet once', async () => {
  const route = pairRouter();

  const paired = await route(postJson('POST /pair', { walletId: WALLET }));
  const { code, expiresAt } = json(paired);
  const claimed = await route(postJson('POST /pair/claim', { code }));
  const again = await route(postJson('POST /pair/claim', { code }));

  assert.equal(paired.statusCode, 200);
  assert.match(code, /^\d{6}$/);
  assert.equal(expiresAt, 1763145600 + 300);
  assert.equal(claimed.statusCode, 200);
  assert.deepEqual(json(claimed), { walletId: WALLET });
  assert.equal(again.statusCode, 404);
});

test('an expired code is a 404', async () => {
  let now = 1763145600000;
  const route = pairRouter(() => now);
  const { code } = json(await route(postJson('POST /pair', { walletId: WALLET })));
  now += 5 * 60 * 1000 + 1;
  assert.equal((await route(postJson('POST /pair/claim', { code }))).statusCode, 404);
});

test('malformed pairing input is a 400', async () => {
  const route = pairRouter();
  assert.equal((await route(postJson('POST /pair', { walletId: 'nope' }))).statusCode, 400);
  assert.equal((await route({ routeKey: 'POST /pair' })).statusCode, 400);
  assert.equal((await route(postJson('POST /pair/claim', { code: '12' }))).statusCode, 400);
  assert.equal((await route({ routeKey: 'POST /pair/claim', body: 'nope' })).statusCode, 400);
});

test('unknown routes are a 404', async () => {
  const route = createRouter({ store: createMemoryStore(), log: silent });
  assert.equal((await route({ routeKey: 'DELETE /events' })).statusCode, 404);
});

test('a store failure is a 500 with a generic message, details only in the log', async () => {
  const logged = [];
  const store = { putIfAbsent: async () => { throw new Error('secret table detail'); }, deltasFor: async () => [] };
  const route = createRouter({ store, log: { error: (...a) => logged.push(a) } });
  const res = await route(post([{ id: 'q', walletId: WALLET, deltaMinutes: 1, at: 1 }]));
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body, /secret/);
  assert.equal(logged.length, 1);
});

test('GET /events lists a wallet\'s events by prefix; bad input is a 400', async () => {
  const route = createRouter({ store: createMemoryStore(), log: silent });
  await route(post([
    { id: 'ext-1', walletId: WALLET, deltaMinutes: -5, at: 1 },
    { id: 'spend-1', walletId: WALLET, deltaMinutes: -2, at: 2 },
  ]));
  const list = (q) => route({ routeKey: 'GET /events', queryStringParameters: q });

  const ext = await list({ walletId: WALLET, prefix: 'ext-' });

  assert.equal(ext.statusCode, 200);
  assert.deepEqual(json(ext), { walletId: WALLET, events: [{ id: 'ext-1', deltaMinutes: -5, at: 1 }] });
  assert.equal(json(await list({ walletId: WALLET })).events.length, 2);
  assert.equal((await list({ walletId: 'nope' })).statusCode, 400);
  assert.equal((await list({ walletId: WALLET, prefix: 'a b' })).statusCode, 400);
  assert.equal((await list(undefined)).statusCode, 400);
});
