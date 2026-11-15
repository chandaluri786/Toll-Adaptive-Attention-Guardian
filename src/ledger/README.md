# src/ledger — Person C (Spec C — Engine, money, cloud)

**Delivers:** umbrella time: quests mint minutes, Cloudy spends 1:1, in a storm only a just-passed quest opens an app, everything resets at 04:00, daily mint cap · 180 days of daily summaries for Forecast (phone only) · sync of minute events to `cloud/ledger`.

**Provides:** `Ledger` · **Consumes:** `Clock`, `PostureSource` (C's own engine)

Flag: `USE_REAL` in `index.ts` (flip first, step 1). Tasks C5, C9, C11: [docs/specs/C-engine-cloud.md](../../docs/specs/C-engine-cloud.md)

**C9 sync + pairing:** `wallet.ts` mints a random UUID on first use (`ledger:wallet`); `cloud.ts` queues every event not yet
acknowledged (`ledger:synced`) and posts it stripped to `{id, walletId, deltaMinutes, at}` in batches of ≤ 100 to
`LEDGER_API_URL` (`cloudConfig.ts`) on each change, retrying on clock ticks at most once a minute. The server is idempotent on
(walletId, id), so a resend never double-counts; any network trouble just leaves events queued (local-first).
After pushing, each pass pulls the wallet's `ext-` events (spends made off the phone) and `real.ts` `absorb()`s them as
`spend` events: unknown ids, whole negative minutes, within 180 days, dated no later than now; a past day gets its reset.
They are marked acknowledged, so they never go back up. Passes run on every change and on clock ticks ≥ 60 s apart. From
`./index.ts`: `walletId()` and `requestPairCode()` → `{ code, expiresAt (ms) } | null` for the laptop to claim. The demo
panel's reset/seed start a new wallet. Jest never syncs (no URL in tests; fetch is injected).
