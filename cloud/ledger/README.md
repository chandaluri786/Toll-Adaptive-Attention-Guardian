# cloud/ledger — Person C (Spec C — tasks C8, C9)

**Delivers:** the entire server. It stores only **event ID, wallet ID, minute delta and timestamp**: no accounts, no app names, no places, no photos. If breached, an attacker gets UUIDs and integers.

- `POST /events` — batch of `{ id, walletId, deltaMinutes, at }`; idempotent on `(walletId, id)`.
- `GET /balance?walletId=` — sum of deltas for the extension and other devices.
- `POST /pair` → 6-digit code valid 5 min · `POST /pair/claim` → wallet ID.

Skeleton: `template.yaml` (AWS SAM) + `src/index.mjs`. Deploy with your own AWS account: `sam build && sam deploy --guided`.
