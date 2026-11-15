# cloud/ledger — Person C (Spec C — tasks C8, C9)

**Delivers:** the entire server. It stores only **event ID, wallet ID, minute delta and timestamp**: no accounts, no app names, no places, no photos. If breached, an attacker gets UUIDs and integers.

## API (HTTP API, JSON)
- `POST /events` — body `{ "events": [{ "id", "walletId", "deltaMinutes", "at" }] }`, 1–100 events.
  Idempotent on `(walletId, id)` via a conditional put: the first write wins, repeats count as duplicates.
  → `200 { "accepted": n, "duplicates": m }`. Anything malformed → `400 { "error" }`, nothing stored.
  Validation: `walletId` a UUID; `id` 1–128 chars of `A-Z a-z 0-9 . _ : -`; `deltaMinutes` a whole number within ±100000;
  `at` positive whole milliseconds; body ≤ 64 KB. **Any other field (e.g. `category`, `questId`) is a 400**, so the
  phone must strip events to these four fields before syncing.
- `GET /balance?walletId=<uuid>` → `200 { "walletId", "balanceMinutes" }` = sum of all deltas (0 for an unknown wallet).
  The phone's ledger closes each day with a `reset` event, so this sum equals the phone's balance once it has synced.
- `POST /pair`, `POST /pair/claim` → `501` until C9.

## Tables
- `LedgerTable`: `walletId` (HASH) + `eventId` (RANGE), plus `deltaMinutes` and `at`. Nothing else.
- `PairTable` (for C9): `code` (HASH), with TTL on `expiresAt` (epoch **seconds**). Suggested row: `{ code, walletId, expiresAt }`.
  Write it with `attribute_not_exists(code)` (retry on a clash), and on claim check `expiresAt > now` yourself, because TTL
  deletion can lag. Delete the row on claim, so a code works once. Env var `PAIR_TABLE`, and the function already has CRUD on it.

## Code
`src/validate.mjs` (boundary checks), `src/ledger.mjs` (logic over an injected store), `src/http.mjs` (routing, 400/404/500/501),
`src/dynamo.mjs` (DynamoDB store; the AWS SDK v3 ships with the nodejs22.x runtime, so the function has no dependencies),
`src/index.mjs` (Lambda entry). Tests use an in-memory store: `cd cloud/ledger && npm test` (Node's test runner, no install).

## Deploy (free tier: on-demand DynamoDB, HTTP API throttled to 10 rps / burst 20, 128 MB arm64 Lambda, 7-day logs)
```
cd cloud/ledger && sam build && sam deploy     # settings in samconfig.toml: stack toll-ledger, us-west-2
sam delete --stack-name toll-ledger             # teardown
```
Then put the `ApiUrl` output in `src/ledger/cloudConfig.ts` (`LEDGER_API_URL`).
