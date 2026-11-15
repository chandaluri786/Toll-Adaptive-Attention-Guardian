# Contract & integration

Everything the three specs share lives here and in `src/contracts.ts`. Agree on it in the first 90 minutes. After that, each person builds against the others' fakes, and nobody waits on anybody until the hour-10 merge. Product rules stay in the planning doc.

## Hour 0 — 90 minutes, all three

1. **0:00–0:30 — read `src/contracts.ts` aloud.** Any change is made now, by all three. (This scaffold already contains the doc's version.)
2. **0:30–1:15 — check the fakes for the interfaces you provide.** This scaffold ships a working fake for every interface, and `npm run check` proves them. Adjust yours if the team changed the contract.
3. **1:15–1:30 — `npm install` and `npm run android` on every phone.** Every native dependency is already in `package.json`. You should see the tabs and every placeholder.

At 1:30 the contract is frozen and the three specs run in parallel.

## Interfaces and their fakes

| Interface | Provider | Used by | What the fake does |
| --- | --- | --- | --- |
| `Clock` | C | A, B, C | Real time plus `setNow(t)`, `setSpeed(x)`, `tick()` |
| `PostureSource` | C | A, B | Holds a state; `setPosture`, `setGrace`, `setAllowance` with canned weather reasons |
| `Ledger` | C | A, B | In memory, starts at 30 min, applies the Storm rule, 180 days of deterministic history |
| `Governor` | C | A | `emergencyUnlock` returns a 15-min window once, then null until reset |
| `UsageFeed` | A | C | `simulateScrolling(on)`, `emitSample`, `emitIntercept` |
| `DeviceSignals` | A | B | `screenOffFor(min)`, `walkAway(metres, min, mocked?)` |
| `Planner` | B | A, C | Plan seed (5 tasks, Algorithms 10:00–11:00) and no-plan seed; sleep 23:00–07:00; fixed home |
| `Quests` | B | A, C | `openSheet` shows the stub sheet; `passActive()` credits the ledger and fires `onVerified` |
| `Debug` | everyone | C (demo panel) | `reset`, `seed('fresh' \| 'demo_2pm' \| 'late_night' \| 'no_plan')` |

How it is wired: `src/services.ts` calls each folder's factory with a late-bound `get()`. Folders reach each other only through the contract, and each folder's `USE_REAL` flag chooses real or fake.

## Events and notifications

A delivers every notification by subscribing; nobody calls A.

| Moment | Source | Delivered by |
| --- | --- | --- |
| Morning and noon plan reminders | `Planner.remindersDue(now)` on each tick | A |
| 10 min before a block | `Planner.nextBlock(now)` within 10 min | A |
| Weather change | `PostureSource.subscribe` | A |
| Free time used | `PostureState.allowanceLeftMin` reaches 0 | A |
| Umbrella under 5 min | `Ledger.onChange`, then `balance() < 5` | A |
| Quest auto-verified | `Quests.onVerified` with `pass: true` | A |
| Persistent weather + umbrella time | `PostureSource` + `Ledger.onChange` | A |

## Integration, hours 10–14

1. **Flip C real** (engine, ledger). Run S2, S5.
2. **Flip A real** (device). Run S1, S6.
3. **Flip B real** (day). Run S3, S4.
4. **Whole system.** Run S7, S8, S9, then S1–S6 again. Hour 14 is the backup video, whatever passes.

| # | Scenario | Pass when | Owners |
| --- | --- | --- | --- |
| S1 | Demo panel sets the clock to 09:58 before Algorithms | Storm with "Storm until 11:00 — you're in Algorithms"; Instagram shows the Storm screen within 1 s | A, B, C |
| S2 | Cloudy, umbrella 30, Open umbrella — 15 min | Instagram opens for 15 min, balance 15, the storm screen returns on expiry | A, C |
| S3 | Storm, umbrella 30, steps quest, `addSteps(2000)` | Open umbrella hidden; quest passes; 25-min window opens at once; balance stays 30 | A, B, C |
| S4 | Meetup on the 600 m track; wrong code, right code, then a mocked sample | Plain retry message; pass; mocked sample fails | B, C |
| S5 | Emergency unlock, then again the same day | First opens everything for 15 min after two taps + confirm; second refused "Back tomorrow"; returns after 04:00 | A, C |
| S6 | Force-stop the engine, revoke overlay, go offline, change the clock | First two open everything within 3 min; offline and clock change open nothing | A |
| S7 | Pair the laptop with a 6-digit code; spend 5 min in the extension | Laptop shows the phone's balance; domain opens; phone balance drops after sync | C |
| S8 | Airplane mode, run S2 and S3 | Both pass offline; events sync when back online | A, B, C |
| S9 | No plan; scroll for 2 h 30 min outside any block | Clear for 2 h; "Free time's up" fires; Cloudy possible, never Storm | A, C |

## Gates

| Hour | Gate |
| --- | --- |
| 1:30 | Contract committed; every phone runs the dev build |
| 3 | A3 blocks Instagram on the demo phone, or pivot to extension-first |
| 4 | A5 fail-open works |
| 10 | A, B and C each demo their own slice on fakes |
| 10–14 | Integration |
| 14 | Backup video. P1 starts only after this |
| 20 | Devpost submitted. Hard stop on features |
| 20–23 | Storm-screen polish, five rehearsals, airplane-mode run |
