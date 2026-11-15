# Getting started — how the team builds Toll

- Repo: https://github.com/chandaluri786/Toll-Adaptive-Attention-Guardian
- Planning doc (all product rules, specs, contract): https://claude.ai/artifact/A3B1LtX6YVTR43D3Uao8br
- Approved design (every screen and state): https://claude.ai/artifact/6W9BYCvTubVmr9SMrv143m

The scaffold is on `main`. Every interface has a working fake, so all three of us can build in parallel and nobody waits on anybody until the hour-10 merge.

## Who does what

- **A — Device** ([name]): Storm screen, blocking, emergency unlock, fail-open, onboarding, notifications, Forecast tab, the weather look. Folders: `src/device/`, `src/ui/`
- **B — Day & quests** ([name]): optional Plan my day + reminders, Today tab, quests and verifiers (steps, phone-down, away from home, meetup code), quest sheet. Folders: `src/day/`, `cloud/quiz/`
- **C — Engine, money, cloud** ([name]): weather/Focus Pressure, free time, umbrella time and the 04:00 reset, demo panel, Settings, AWS ledger, pairing, Chrome extension. Folders: `src/engine/`, `src/ledger/`, `cloud/ledger/`, `extension/`

Your spec is in [`docs/specs/`](specs/): [A-device.md](specs/A-device.md), [B-day-quests.md](specs/B-day-quests.md), [C-engine-cloud.md](specs/C-engine-cloud.md). Read it first: it opens with the features you deliver, then your tasks with "done when" for each.

## Before we start (each laptop)

1. Node 22 and git installed.
2. Android Studio with the Android SDK, and `adb` working.
3. An Android phone with Developer options and USB debugging on. Plug it in and check that `adb devices` lists it.
4. C: an AWS account with the AWS SAM CLI. B (only for the P1 quiz): Bedrock model access on AWS.

## Hour 0 — all three together (90 min)

1. Clone and install:

   ```bash
   git clone https://github.com/chandaluri786/Toll-Adaptive-Attention-Guardian.git
   cd Toll-Adaptive-Attention-Guardian
   npm install
   npm run check
   ```

   `npm run check` runs the typecheck and tests; it must pass (9 passing, 8 to-dos).
2. Build on your phone: `npm run android`. The first native build takes 10–15 minutes. Expo Go will **not** work; we use native modules, so it has to be this dev build. You should see three tabs (Today, Forecast, Settings) with placeholder screens.
3. Read `src/contracts.ts` aloud together. It's the only connection between our three parts. Any change happens now, by all three of us. **At 1:30 it's frozen.**
4. Put your GitHub handles in `.github/CODEOWNERS` and uncomment the lines.

## How we work

- Only edit your own folders. `src/contracts.ts`, `src/services.ts`, `src/shared/` and `src/app/` are shared and frozen. Changing them needs all three of us in one commit.
- Small commits straight to `main`. Pull before every push. Run `npm run check` before pushing and keep `main` green.
- Build against the fakes. Settings → **Demo panel** lets you switch weather (Clear / Cloudy / Storm), use up free time, move the clock, add steps, and seed the "2pm lecture", "late night" and "no plan" scenarios.
- Each folder's `index.ts` has a `USE_REAL` flag. Leave it `false` until integration.
- Always read time with `services.clock.now()`, never `Date.now()`, or the demo panel can't move time.
- Announce before adding any new native package, because everyone has to rebuild.
- Users only ever see weather words (Clear skies, Cloudy, Storm, umbrella time). Never "blocked", "failed" or "posture". No red anywhere.
- All personal data stays on the phone. The server only ever gets wallet ID + minute counts.

## Where each person starts

### A — Device

1. A1: get the dev build on both demo phones.
2. A2 + A3: wire `expo-app-blocker` (wrapper in `src/device/native/appBlocker.ts`). **Hour-3 gate:** opening Instagram shows our Storm screen within 1 second, 10 times in a row, on the demo phone. If this fails, we pivot to an extension-first product immediately.
3. A5 by hour 4: emergency unlock + fail-open.
4. Then A6 (Storm screen, the polish priority), A7 onboarding, A9 screen/location signals, A10 notifications, A11 Forecast.
5. Known risk: the blocker's background service can't also carry location. By hour 3, work out how background location will run (likely expo-location's own foreground service). B needs it for the away-from-home quest.

### B — Day & quests

1. B1–B4 first: planner store, Plan my day + reminders, quest engine, step verifier.
2. Verifiers in `src/day/verifiers.ts` are pure functions. Test them with A's fake signals (`walkAway(600, 45)`, `screenOffFor(25)`), no phone needed.
3. B7 meetup code: **test handwriting OCR on the demo phone by hour 6.** It's the demo's money shot and our weakest link.
4. Then B8 quest sheet, B9 Today. Quiz (B10) and GitHub (B11) only after hour 14.

### C — Engine, money, cloud

1. C2 first: turn the `it.todo` worked-day rows in `src/engine/__tests__/scoring.test.ts` into real tests, then implement `src/engine/scoring.ts` until they pass.
2. Then C3 transitions, C4 emergency-unlock governor, C5 ledger with the 04:00 reset. A and B switch onto these at hour 10, so they come first.
3. C6 demo panel is not optional: a real weather change takes ~3.5 minutes, longer than the demo slot.
4. Then AWS (C8: `cd cloud/ledger && sam build && sam deploy --guided`), pairing (C9), Chrome extension (C10).

## Timeline

- **1:30** — contract frozen, every phone runs the dev build
- **3** — A3 blocking works on the demo phone (or pivot)
- **4** — A5 fail-open works
- **6** — B's OCR tested on the demo phone
- **10** — each of us demos our own part on fakes
- **10–14** — integration (below)
- **14** — record the backup video, whatever state it's in. Lower-priority (P1) tasks only after this
- **20** — Devpost submitted, hard stop on features
- **20–23** — Storm-screen polish, 5 rehearsals, one airplane-mode run

## Integration (hours 10–14)

Flip the flags in this order, then run the test scenarios in [`docs/contract.md`](contract.md):

1. C flips `src/engine/index.ts` and `src/ledger/index.ts` → run S2, S5
2. A flips `src/device/index.ts` → run S1, S6
3. B flips `src/day/index.ts` → run S3, S4
4. Everyone: S7, S8, S9, then S1–S6 again

Whoever flipped fixes their own side. A contract mismatch gets fixed by all three, in one commit.

## Before the demo

- Demo on the same phone blocking was proven on; keep a second phone ready.
- Set "home" on the demo phone somewhere other than the venue (the meetup quest needs you 500 m+ from home).
- Pre-write the wrong-code card and bring a marker for the right one.
- Backup video on a USB stick and in the cloud.
- One person speaks, one drives the phone.

Questions about rules or numbers → check the planning doc first; it's the single source of truth.
