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
- `POST /pair` — body exactly `{ "walletId": "<uuid>" }` → `200 { "code": "123456", "expiresAt": <epoch seconds> }`.
  A random 6-digit code valid **5 minutes**, stored with `attribute_not_exists(code)` and retried (up to 5 times) on a clash.
- `POST /pair/claim` — body exactly `{ "code": "123456" }` → `200 { "walletId" }` and the code is deleted (works **once**).
  Unknown, already used and expired codes all get the same **`404 { "error" }`** (expiry is checked against `expiresAt`, since
  TTL deletion lags; the take is one atomic DeleteItem, so two claims can't both win). Malformed body (not six digits, extra
  fields, > 1 KB) → `400`. Guessing is bounded by the stage throttle (10 rps): ~3000 tries per 5-minute code in a million.

## Tables
- `LedgerTable`: `walletId` (HASH) + `eventId` (RANGE), plus `deltaMinutes` and `at`. Nothing else.
- `PairTable`: `code` (HASH), `walletId`, `expiresAt` (epoch **seconds**, TTL). Nothing else. Env var `PAIR_TABLE`.

## Code
`src/validate.mjs` (boundary checks), `src/ledger.mjs` (logic over an injected store), `src/pairing.mjs` (pair/claim over an
injected pair store and clock), `src/http.mjs` (routing, 400/404/500), `src/dynamo.mjs` + `src/pairStore.mjs` (DynamoDB stores; the AWS SDK v3 ships with the nodejs22.x runtime, so the function has no dependencies),
`src/index.mjs` (Lambda entry). Tests use in-memory stores: `cd cloud/ledger && npm test` (Node's test runner, no install).

## Deploy (free tier: on-demand DynamoDB, HTTP API throttled to 10 rps / burst 20, 128 MB arm64 Lambda, 7-day logs)
```
cd cloud/ledger && sam build && sam deploy     # settings in samconfig.toml: stack toll-ledger, us-east-2
sam delete --stack-name toll-ledger --region us-east-2   # teardown (only us-east-2 is allowed by the org policy)
```
Live: `https://w73jkps50l.execute-api.us-east-2.amazonaws.com` (also `LEDGER_API_URL` in `src/ledger/cloudConfig.ts`).
