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

### Trying the live Storm / Cloud screen in the browser

The fake weather lives in memory, so **reloading the page resets it to Clear skies**. Set the weather in the link instead (it is ignored on a real phone):

| Link (add to `http://localhost:8081`) | What you get |
| --- | --- |
| `/blocked?app=Scrollr&package=com.instagram.android&weather=cloudy` | Cloudy: Wait 60 seconds, Open umbrella (30 min balance), Take a quest |
| `/blocked?app=Scrollr&package=com.instagram.android&weather=storm` | Storm: no umbrella door, quest first |
| `/blocked?app=Scrollr&package=com.instagram.android&weather=clear` | Clear skies |

Try: **Wait 60 seconds** (countdown, filling bar, the sky settles), **Open umbrella** (the opened screen), **Emergency unlock** (tap, tap, confirm; once a day).

**Light or dark in the browser:** add `&theme=dark` (or `theme=light`) to any link, e.g. `/forecast?theme=dark`. Without it the page follows your system setting (changing the DevTools *UI* theme does not count; use DevTools > More tools > Rendering > "Emulate prefers-color-scheme", or your OS setting). On a phone the app always follows the phone.

