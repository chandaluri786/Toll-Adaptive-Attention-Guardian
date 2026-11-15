import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventBatch, parseWalletId, MAX_BATCH } from '../src/validate.mjs';

const WALLET = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';
const ev = (over = {}) => ({ id: 'quest-q_8f2a', walletId: WALLET, deltaMinutes: 25, at: 1763145600000, ...over });
const body = (events) => JSON.stringify({ events });

test('accepts a well-formed batch and keeps only the four fields', () => {
  const result = parseEventBatch(body([ev(), ev({ id: 'reset-2026-11-15', deltaMinutes: -25 })]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.events[0], { id: 'quest-q_8f2a', walletId: WALLET, deltaMinutes: 25, at: 1763145600000 });
  assert.equal(result.events[1].deltaMinutes, -25);
});

test('rejects bodies that are not JSON or not { events: [...] }', () => {
  for (const raw of [undefined, '', 'not json', '[]', '{}', '{"events":{}}', 'null', '42']) {
    assert.equal(parseEventBatch(raw).ok, false, `should reject ${raw}`);
  }
});

test('rejects an empty batch and one over the limit', () => {
  assert.equal(parseEventBatch(body([])).ok, false);
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ev({ id: `spend-${i}` }));
  assert.equal(parseEventBatch(body(many)).ok, false);
});

test('rejects any extra field, so nothing but the four fields can reach the table', () => {
  const result = parseEventBatch(body([ev({ category: 'fitness' })]));
  assert.equal(result.ok, false);
  assert.match(result.error, /category/);
});

test('rejects malformed ids', () => {
  for (const id of ['', ' ', 'a'.repeat(129), 'has space', 'semi;colon', 7, null]) {
    assert.equal(parseEventBatch(body([ev({ id })])).ok, false, `should reject id ${JSON.stringify(id)}`);
  }
});

test('rejects wallet ids that are not UUIDs', () => {
  for (const walletId of ['', 'wallet-1', `${WALLET}x`, 123, null]) {
    assert.equal(parseEventBatch(body([ev({ walletId })])).ok, false);
  }
});

test('rejects non-integer or out-of-range minute deltas', () => {
  for (const deltaMinutes of [1.5, NaN, '25', null, 100001, -100001]) {
    assert.equal(parseEventBatch(body([ev({ deltaMinutes })])).ok, false, `should reject ${deltaMinutes}`);
  }
  assert.equal(parseEventBatch(body([ev({ deltaMinutes: 0 })])).ok, true);
});

test('rejects timestamps that are not positive whole milliseconds', () => {
  for (const at of [0, -1, 1.5, '1763145600000', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseEventBatch(body([ev({ at })])).ok, false, `should reject ${at}`);
  }
});

test('rejects oversized bodies', () => {
  assert.equal(parseEventBatch('x'.repeat(70_000)).ok, false);
});

test('parseWalletId accepts a UUID and rejects anything else', () => {
  assert.deepEqual(parseWalletId(WALLET), { ok: true, walletId: WALLET });
  assert.equal(parseWalletId(WALLET.toUpperCase()).ok, true);
  for (const bad of [undefined, '', 'abc', `${WALLET} `]) assert.equal(parseWalletId(bad).ok, false);
});
