# Spec B — Day & quests

**Owner:** Person B · best for whoever is strongest at sensors, the camera and product UI · P0 ≈ 17 h
**Source of truth for rules:** the planning doc (main tab), sections named below. Visual reference: the design state gallery.

## Functionality this delivers

When B is done, a user can:

1. **Plan the day, if they want.** An optional **Plan my day** sheet takes 1–7 typed tasks (fitness, place, meetup, study, coding, focus). It locks 30 minutes after Start, and tasks added later earn half. "Not today" is always there.
2. **Get gentle reminders:** a morning reminder, plus one at noon only if nothing is planned. No plan is a normal state, and the app still works.
3. **Keep a timetable and home:** optional typed blocks (class, meeting, deep work, wind-down, sleep) capped at 4 h (sleep 10 h, default 23:00–07:00), and a home location that never leaves the phone.
4. **See Today:** the weather and its reason, umbrella time, the free-time meter, tasks with live progress (or "No plan today — that's fine"), and one suggested quest.
5. **Take quests and earn umbrella time**, verified on the phone:
   - walk 2,000 steps
   - 25 minutes with the phone down
   - 45 minutes over 500 m from home
   - a meetup proven by a handwritten three-word code photo (OCR, image deleted)
   - P1: a study quiz, and GitHub commits
6. **Never be punished for a sensor miss.** A miss gives a kind, specific reason ("You're 200 m from home — need 500 m") and "Try again in 5 min", plus "Didn't catch it? Claim half".
7. **In a storm, a passed quest opens the app straight away**, through the ledger.

## Owns

| Path | What |
| --- | --- |
| `src/day/index.ts` | `USE_REAL` flag; real/fake factory |
| `src/day/fakes.ts` | Planner (plan / no-plan seeds) + Quests (stub sheet) fakes |
| `src/day/verifiers.ts` | Pure verifier functions (steps, screen-off, away-from-home, meetup code) + `distanceM` |
| `src/day/screens/TodayScreen.tsx` | Today tab |
| `src/day/screens/PlanMyDaySheet.tsx` | Optional plan sheet (always mounted) |
| `src/day/screens/QuestSheetHost.tsx` | Quest sheet (always mounted; opened by `Quests.openSheet`) |
| `src/day/components/SetHomeStep.tsx` | Step 3 of A's onboarding |
| `src/day/components/PlannerSection.tsx` | Section inside C's Settings |
| `cloud/quiz/` | Quiz Lambda (P1) |

## Interfaces

| Direction | Interface | Counterpart | Test with until integration |
| --- | --- | --- | --- |
| Provides | `Planner`, `Quests`, `QuestsDebug` | A and C | B's own debug controls in `fakes.ts` |
| Consumes | `DeviceSignals` | A | Device fake: `screenOffFor(min)`, `walkAway(m, min, mocked?)`; or expo-location in the foreground for real walks |
| Consumes | `Ledger`, `PostureSource`, `Clock` | C | Ledger fake (Storm rule); weather buttons; `setNow` |
| Uses directly | expo-sensors pedometer, expo-camera, ML Kit text recognition | — | The real phone |

## Tasks

| ID | Task | Done when | Est | Pri |
| --- | --- | --- | --- | --- |
| B1 | Planner store + `Planner` | Goals, typed blocks (4-h cap, sleep ≤ 10 h, default 23:00–07:00), home persist; all `Planner` methods return them; `PlannerSection` + `SetHomeStep` render | 2h | P0 |
| B2 | Plan my day + reminders | Optional sheet with "Not today"; 1–7 typed tasks; locks 30 min after Start, later tasks earn half; `remindersDue` gives morning, then noon only if unplanned | 1.5h | P0 |
| B3 | Quest engine | Baseline on accept; 4-h expiry; 2-h same-type cooldown; cross-signal flag; claim-half credits at rate 0.5 (half a task); every result calls `Ledger.credit` and fires `onVerified` | 2h | P0 |
| B4 | Step verifier | A real 2,000-step walk passes; under 5 min rejected; over 200 steps/min flagged; a miss shows "620 of 2,000" | 1.5h | P0 |
| B5 | Screen-off verifier | Pure over `onScreen`: 25 min off passes; any screen-on resets | 1h | P0 |
| B6 | Away-from-home verifier | Pure over `onLocation`: > 500 m with accuracy ≤ 100 m adds a minute; a mocked sample fails at once; passes at 45 min | 2h | P0 |
| B7 | Meetup code (**test OCR on the demo phone by hour 6**) | Three-word code; in-app capture only; on-device OCR; 2 of 3 words within Levenshtein 2; image released; B6's distance check must pass too | 3h | P0 |
| B8 | Quest sheet | Offer → in progress (live readout) → result, over any screen incl. the Storm screen; coins drop on pass; never red, never "failed" | 2h | P0 |
| B9 | Today screen | Weather + reason, umbrella time, free-time meter, tasks or the no-plan state, one suggested quest | 2h | P0 |
| B10 | Quiz + `cloud/quiz` Lambda | One request carries the day's topics; schema check, one retry, fall back to focus; works offline; 3 of 9, 90 s, pass at 2 | 2.5h | P1 |
| B11 | GitHub verifier | Baseline commit count, polled every 5 min, passes on any increase. Public REST API, no auth: owner/repo (default branch) or username (commit search); only the name is sent | 1h | P1 |

Build B1–B4 first. Three working verifiers beat six half-working ones.

## Rules B implements (planning doc sections)

The Planner (goals, optional timetable with caps, optional plans, task↔quest link) · Task verification (all subsections: baseline rule, 4-h expiry, per-method steps, meetup protocol, quiz, rules on top, sensor fallback) · Privacy model (evidence write-once, `Verdict` matches the proof receipt) · Wellbeing (no fitness quest after the daily target) · UI: Screens 2, 3, 5, plan reminders, onboarding step 3 · Feasibility: sensors, risks 3–4.

## Integration

B flips `src/day/index.ts` at **step 3**, after C and A. It must pass:
- S3: a quest in a storm opens a window at once
- S4: meetup wrong and right code, plus a mocked location
- S1 again with the real timetable
- S9 with no plan
- S8 offline

After the flip:
- **C sees** real plan progress, blocks and sleep window, with no plan counting as 0, plus real wins.
- **A sees** the real quest sheet over the Storm screen, and real reminders.
- **B sees** real credits (a pass in a storm opens a window), real weather and free time, and real GPS and screen events.

## Out of scope

How many minutes a pass is worth, caps and the reset (C — B sends category + rate) · blocking, Storm screen, Forecast, notifications (A) · native location/screen code (A) · scoring, free time, governor (C) · ledger backend, pairing, extension (C).
