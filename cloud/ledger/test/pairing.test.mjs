import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPairingService, PAIR_TTL_SEC, PAIR_RETRIES } from '../src/pairing.mjs';
import { parsePairRequest, parseClaimRequest } from '../src/validate.mjs';
import { createMemoryPairStore } from './memoryPairStore.mjs';

const WALLET = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';
const T0 = 1763145600000; // ms

const service = ({ store = createMemoryPairStore(), codes = ['123456'], now = () => T0 } = {}) => {
  const queue = [...codes];
  return { store, pairing: createPairingService({ store, now, randomCode: () => queue.shift() ?? '999999' }) };
};

test('pair stores { code, walletId, expiresAt } with expiresAt in epoch seconds, 5 minutes out', async () => {
  const { store, pairing } = service();

  const result = await pairing.pair(WALLET);

  assert.equal(PAIR_TTL_SEC, 300);
  assert.deepEqual(result, { code: '123456', expiresAt: T0 / 1000 + 300 });
  assert.deepEqual(store.rows.get('123456'), { code: '123456', walletId: WALLET, expiresAt: T0 / 1000 + 300 });
});

test('pair retries with a new code when the first one is taken', async () => {
  const { store, pairing } = service({ codes: ['111111', '222222'] });
  await store.putIfAbsent({ code: '111111', walletId: 'someone-else', expiresAt: T0 / 1000 + 300 });

  const result = await pairing.pair(WALLET);

  assert.equal(result.code, '222222');
  assert.equal(store.rows.get('111111').walletId, 'someone-else');
});

test('pair gives up after a bounded number of clashes', async () => {
  const store = { putIfAbsent: async () => false, take: async () => null };
  const { pairing } = service({ store });
  await assert.rejects(pairing.pair(WALLET), /no free pairing code/);
  assert.ok(PAIR_RETRIES >= 3);
});

test('claim returns the wallet and the code works only once', async () => {
  const { pairing } = service();
  await pairing.pair(WALLET);

  const first = await pairing.claim('123456');
  const second = await pairing.claim('123456');

  assert.deepEqual(first, { walletId: WALLET });
  assert.equal(second, null);
});

test('claim refuses an expired code even when TTL has not deleted the row yet', async () => {
  let now = T0;
  const { store, pairing } = service({ now: () => now });
  await pairing.pair(WALLET);
  now = T0 + 300 * 1000; // exactly at expiry: no longer valid

  assert.equal(await pairing.claim('123456'), null);
  assert.equal(store.rows.size, 0); // the stale row is gone too
});

test('claim of an unknown code is null', async () => {
  const { pairing } = service();
  assert.equal(await pairing.claim('000000'), null);
});

test('the default code generator gives 6 digits', async () => {
  const store = createMemoryPairStore();
  const pairing = createPairingService({ store, now: () => T0 });
  const { code } = await pairing.pair(WALLET);
  assert.match(code, /^\d{6}$/);
});

test('parsePairRequest accepts only { walletId: uuid }', () => {
  assert.deepEqual(parsePairRequest(JSON.stringify({ walletId: WALLET })), { ok: true, walletId: WALLET });
  assert.equal(parsePairRequest(JSON.stringify({ walletId: 'nope' })).ok, false);
  assert.equal(parsePairRequest(JSON.stringify({ walletId: WALLET, name: 'x' })).ok, false);
  assert.equal(parsePairRequest('not json').ok, false);
  assert.equal(parsePairRequest(undefined).ok, false);
  assert.equal(parsePairRequest('[]').ok, false);
});

test('parseClaimRequest accepts only { code: six digits }', () => {
  assert.deepEqual(parseClaimRequest(JSON.stringify({ code: '012345' })), { ok: true, code: '012345' });
  for (const code of ['12345', '1234567', 'abcdef', 123456, '12 456']) {
    assert.equal(parseClaimRequest(JSON.stringify({ code })).ok, false, String(code));
  }
  assert.equal(parseClaimRequest(JSON.stringify({ code: '123456', extra: 1 })).ok, false);
  assert.equal(parseClaimRequest('x'.repeat(2000)).ok, false);
});
