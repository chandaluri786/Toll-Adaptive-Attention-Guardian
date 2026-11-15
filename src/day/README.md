# src/day — Person B (Spec B — Day & quests)

**Delivers:** optional Plan my day + morning/noon reminders · optional timetable (4-h blocks, sleep ≤ 10 h) and home · the Today tab · quests with on-phone verification (steps, phone-down, away from home, meetup code; quiz and GitHub are P1) · the quest sheet with claim-half.

**Provides:** `Planner`, `Quests` · **Consumes:** `DeviceSignals` (A) · `Ledger`, `PostureSource`, `Clock` (C)

Flag: `USE_REAL` in `index.ts` (flip at integration step 3). Full spec, tasks B1–B11: [docs/specs/B-day-quests.md](../../docs/specs/B-day-quests.md)
