// OWNER: C (Spec C — tasks C8, C9). Lambda entry: wires the DynamoDB store into the router.
// Stores only eventId, walletId, deltaMinutes, at.
import { createRouter } from './http.mjs';
import { createDynamoStore } from './dynamo.mjs';

const route = createRouter({ store: createDynamoStore({ tableName: process.env.TABLE }) });

export const handler = (event) => route(event);
