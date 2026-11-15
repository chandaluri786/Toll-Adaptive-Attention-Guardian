// OWNER: C (Spec C — tasks C8, C9). Lambda entry: wires the DynamoDB store into the router.
// Stores only eventId, walletId, deltaMinutes, at (ledger) and code, walletId, expiresAt (pairing).
import { createRouter } from './http.mjs';
import { createDynamoStore } from './dynamo.mjs';
import { createDynamoPairStore } from './pairStore.mjs';

const route = createRouter({
  store: createDynamoStore({ tableName: process.env.TABLE }),
  pairStore: createDynamoPairStore({ tableName: process.env.PAIR_TABLE }),
});

export const handler = (event) => route(event);
