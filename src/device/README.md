# src/device — Person A (Spec A — Device)

**Delivers:** the Storm screen when a distracting app opens · emergency unlock (once a day) · fail-open · always-open apps · onboarding · distracting-app list with 12-hour removal · notifications · the Forecast tab.

**Provides:** `UsageFeed`, `DeviceSignals` · **Consumes:** `PostureSource`, `Clock`, `Ledger`, `Governor` (C) · `Planner`, `Quests` (B)

Flag: `USE_REAL` in `index.ts` (flip at integration step 2). Full spec, tasks A1–A13: [docs/specs/A-device.md](../../docs/specs/A-device.md)
