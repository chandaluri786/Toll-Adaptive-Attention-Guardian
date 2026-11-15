# Spec C — Engine, money, cloud

**Owner:** Person C · best for whoever is strongest at pure logic, tests and AWS · P0 ≈ 17.5 h
**Source of truth for rules:** the planning doc (main tab), sections named below.

## Functionality this delivers

When C is done:

1. **The sky decides itself.** Every 60 seconds the engine scores Focus Pressure (0–100) and sets the weather (Clear skies / Cloudy / Storm), with a friendly reason ("Storm until 11:00 — you're in Algorithms") and the next change.
2. **The first 2 hours each day are free.** Until they're used up, only the user's own blocks count. After that, behaviour (plan deficit, scrolling, repeated opens) can turn the sky Cloudy.
3. **Storms only happen inside blocks the user declared.** Outside a block the score cannot pass 60. Missing inputs count 0, so with no plan the worst outside sleep is Cloudy.
4. **The weather never flaps.** Stricter states start at 35/65 and end 5 points lower, a change must hold for two readings, and there's a 90-second "clouds gathering" warning before any block.
5. **Umbrella time works:**
   - quests mint minutes (25/25/25/20/20/15, half for claim-half)
   - Cloudy spends 1:1
   - in a storm only a just-passed quest opens an app
   - everything resets to 0 at 04:00
   - the daily mint cap is 150
6. **The emergency unlock** is allowed once a day and logged.
7. **Forecast has data:** daily summaries are kept on the phone for 180 days.
8. **The laptop sees the same umbrella time.** It pairs with a 6-digit code (5-minute expiry), and the Chrome extension blocks listed sites unless the user spends minutes.
9. **The server knows almost nothing:** only event ID, wallet ID, minute delta and timestamp. No accounts.
10. **Demo-ready:** a demo panel forces the clock, weather, free time and steps, so a 3.5-minute weather change fits a 3-minute demo. Settings shows the thresholds and lets you change them live.

## Owns

| Path | What |
| --- | --- |
| `src/engine/index.ts` | `USE_REAL` flag; real/fake factory |
| `src/engine/fakes.ts` | Clock (`setNow`, speed, `tick`), PostureSource (weather buttons), Governor (1 emergency/day) fakes |
| `src/engine/scoring.ts` + `__tests__/scoring.test.ts` | `score()` + `deficitPoints()`; worked-day rows waiting as `it.todo` |
| `src/engine/screens/DemoPanel.tsx` | Route `demo` |
| `src/engine/screens/SettingsContainer.tsx` | Settings tab; hosts A's and B's sections |
| `src/engine/screens/EngineSection.tsx` | Thresholds + Focus Pressure explainer |
| `src/ledger/index.ts`, `src/ledger/fakes.ts` | Ledger fake (Storm rule, earning table, 180-day history) |
| `cloud/ledger/` | API Gateway + Lambda + DynamoDB stack |
| `extension/` | Chrome extension (MV3) |

## Interfaces

| Direction | Interface | Counterpart | Test with until integration |
| --- | --- | --- | --- |
| Provides | `Clock`, `PostureSource`, `Ledger` (incl. `history`), `Governor` | A and B | Unit tests; demo panel |
| Consumes | `UsageFeed` | A | Device fake: `simulateScrolling`, `emitSample`, `emitIntercept` |
| Consumes | `Planner`, `Quests.onVerified` | B | Day fake: plan / no-plan seeds, `passActive()` |
| Consumes | every folder's `Debug`, `QuestsDebug.addSteps` | A, B | Their fakes (already wired in `src/services.ts` → `debug`) |
| Hosts | `RestrictedAppsSection` (A), `PlannerSection` (B) | A, B | Their placeholders |

## Tasks

| ID | Task | Done when | Est | Pri |
| --- | --- | --- | --- | --- |
| C1 | Clock + debug wiring | 60-s tick, monotonic for staleness; `setNow` + speed; demo panel reaches every `Debug` | 0.5h | P0 |
| C2 | Scoring, free time, reasons | Pure `score(signals)` + a `Signals` builder over `UsageFeed`, `Planner`, `onVerified`; free time counts down and switches behaviour on at 0; missing inputs = 0; **every worked-day row and "max 60 outside a block" pass as tests**; reasons in weather words | 2.5h | P0 |
| C3 | Weather transitions | Enter at band, exit 5 below, 2-sample hold, 90-s grace; 62–66 oscillation never flaps; Storm impossible without a current block | 1.5h | P0 |
| C4 | Governor | `emergencyUnlock` 15-min all-apps once a day, null after, back at 04:00; logged for Forecast | 1h | P0 |
| C5 | Ledger, economy, daily reset | Append-only events, balance = sum, idempotent IDs; 04:00 reset; mint cap; spend refused in Storm; credit opens a window in Storm; earning × rate; `history()` 180 days | 2.5h | P0 |
| C6 | Demo panel (**not optional**) | Forces clock, weather, free time, steps; seeds `demo_2pm`, `late_night`, `no_plan`; resets everything | 1.5h | P0 |
| C7 | Settings container | Hosts A's and B's sections + thresholds with the Focus Pressure explainer; editing a threshold changes the weather live | 1h | P0 |
| C8 | AWS ledger stack | Table holds only event ID, wallet ID, delta, timestamp; idempotent POST; GET balance | 2.5h | P0 |
| C9 | Pairing + sync | 6-digit code valid 5 min; laptop claims it and gets the wallet ID; offline queue syncs with no double counting | 2h | P0 |
| C10 | Chrome extension | Pairs by code; own domain list; blocks unless a spend window is open; spending posts an event | 2.5h | P0 |
| C11 | Economy extras | Diminishing returns and late-night 2× pass their tests | 1h | P1 |

C1–C5 come first, because A and B swap onto them at hour 10.

## Rules C implements (planning doc sections)

Scoring (all of it: base, behaviour, free time, missing inputs, storms only in own blocks, deficit formula, bands, asymmetry, hold and grace, worked day, reasons) · The Sealed rule (inside the ledger) · How blocks lift (four ways out, Safety: emergency + fail-open signal, guarantees 1–3) · The incentive economy · Privacy (ledger row, no accounts, day summaries never leave the phone) · Browser scope (desktop) · UI Screen 7 · Demo script (DynamoDB beat, panel).

## Integration

C flips `src/engine/index.ts` and `src/ledger/index.ts` **first (step 1)**, while A and B stay on fakes. It must pass:
- on step 1: S2 (Cloudy spend) and S5 (emergency once a day)
- at step 4: S7 (laptop and extension), S8 (offline sync) and S9 (free time, then Cloudy)

C drives the demo panel during integration.

After the flip:
- **A sees** computed weather and the real ledger, governor and Forecast data.
- **B sees** `credit` applying the economy, with Storm windows opening at once.
- **C sees** real inputs after steps 2 and 3.

## Out of scope

Blocking, Storm screen, Forecast, notifications (A) · deciding whether a quest passed, Plan my day, Today, quiz Lambda (B) · any native Android code (A) · calendar import, streaks, levels, badges, Supermemory (cut).
