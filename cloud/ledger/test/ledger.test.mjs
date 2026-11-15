import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerService } from '../src/ledger.mjs';
import { createMemoryStore } from './memoryStore.mjs';

const W1 = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';
const W2 = '00000000-0000-4000-8000-000000000002';
const ev = (id, deltaMinutes, walletId = W1) => ({ id, walletId, deltaMinutes, at: 1763145600000 });

test('stores each new event as exactly walletId, eventId, deltaMinutes, at', async () => {
  const store = createMemoryStore();
  const ledger = createLedgerService(store);
  const result = await ledger.postEvents([ev('quest-a', 25)]);
  assert.deepEqual(result, { accepted: 1, duplicates: 0 });
  assert.deepEqual([...store.rows.values()], [{ walletId: W1, eventId: 'quest-a', deltaMinutes: 25, at: 1763145600000 }]);
});

test('posting the same event twice counts it once', async () => {
  const ledger = createLedgerService(createMemoryStore());
  await ledger.postEvents([ev('quest-a', 25)]);
  const again = await ledger.postEvents([ev('quest-a', 25)]);
  assert.deepEqual(again, { accepted: 0, duplicates: 1 });
  assert.equal(await ledger.balance(W1), 25);
});

test('a repeated id inside one batch counts once', async () => {
  const ledger = createLedgerService(createMemoryStore());
  const result = await ledger.postEvents([ev('quest-a', 25), ev('quest-a', 25)]);
  assert.deepEqual(result, { accepted: 1, duplicates: 1 });
  assert.equal(await ledger.balance(W1), 25);
});

test('the first write wins when an id is reused with a different delta', async () => {
  const ledger = createLedgerService(createMemoryStore());
  await ledger.postEvents([ev('quest-a', 25)]);
  await ledger.postEvents([ev('quest-a', 999)]);
  assert.equal(await ledger.balance(W1), 25);
});

test('the same event id in two wallets is two events', async () => {
  const ledger = createLedgerService(createMemoryStore());
  await ledger.postEvents([ev('quest-a', 25, W1), ev('quest-a', 10, W2)]);
  assert.equal(await ledger.balance(W1), 25);
  assert.equal(await ledger.balance(W2), 10);
});

test('balance is the sum of deltas, including spends and resets', async () => {
  const ledger = createLedgerService(createMemoryStore());
  await ledger.postEvents([ev('quest-a', 25), ev('spend-1', -5), ev('reset-2026-11-14', -20), ev('quest-b', 13)]);
  assert.equal(await ledger.balance(W1), 13);
});

test('an unknown wallet has balance 0', async () => {
  const ledger = createLedgerService(createMemoryStore());
  assert.equal(await ledger.balance(W2), 0);
});
