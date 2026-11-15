# src/device — Person A (Spec A — Device)

**Delivers:** the Storm screen when a distracting app opens · emergency unlock (once a day) · fail-open · always-open apps · onboarding · distracting-app list with 12-hour removal · notifications · the Forecast tab.

**Provides:** `UsageFeed`, `DeviceSignals` · **Consumes:** `PostureSource`, `Clock`, `Ledger`, `Governor` (C) · `Planner`, `Quests` (B)

Flag: `USE_REAL` in `index.ts` (flip at integration step 2). Full spec, tasks A1–A13: [docs/specs/A-device.md](../../docs/specs/A-device.md)

## Status

| Part | State |
| --- | --- |
| Logic (policy matrix, enforcer plan, usage meter, fail-open, 12 h removal, notification router, forecast, Storm view model) | Done, unit tested (`npm run check`) |
| Screens (Storm, Onboarding, Forecast, restricted-apps section) | Done, match the design, viewable without a phone |
| Real adapters in `native/` (`expo-app-blocker`, permissions, installed apps, notifications) | Written, **not yet run on a phone** (`USE_REAL = false`) |

## How it fits together

`kit.ts` builds one `DeviceKit` from ports (`ports.ts`): `BlockerPort`, `PermissionsPort`, `InstalledAppsPort`, `Notifier`, `KeyValueStore`. `fakePorts.ts` implements them in memory; `native/` implements them on Android. Both go through the same kit, so tests exercise the same code the phone runs. `DeviceRuntime.tsx` starts it (enforce every 10 s, usage meter every 1 s, permission check every 15 s).

Pure logic is kept out of components: `policy.ts`, `enforcer.ts`, `usageMeter.ts`, `failOpen.ts`, `appConfig.ts`, `notifications.ts`, `forecast.ts`, `stormViewModel.ts`. Screens in `screens/*View.tsx` only render a view model.

## Known gaps

- `expo-app-blocker` has no foreground-app event stream, so time spent in an unlocked app is measured by the unlock-budget meter (`usageMeter.ts`) instead.
- Screen on/off and background location are not available from the blocker's service type (see `native/signals.ts`).

## See it without a phone

`npm run web`, then open `/gallery`: every screen and state, light and dark, built from the real logic.
