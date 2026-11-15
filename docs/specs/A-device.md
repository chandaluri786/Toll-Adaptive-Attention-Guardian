# Spec A — Device

**Owner:** Person A · best for whoever is most comfortable with native Android and Expo dev builds · P0 ≈ 17.5 h
**Source of truth for rules:** the planning doc (main tab), sections named below. Visual reference: the design state gallery.

## Functionality this delivers

When A is done, a user can:

1. **Get intercepted.** Opening a distracting app under clouds or a storm shows the **Storm screen** within about 1 second.
2. **Choose a way out on that screen:** wait 60 seconds, open the umbrella with earned minutes (Cloudy only), or take a quest. The reason ("Storm until 11:00 — you're in Algorithms") is always shown.
3. **Use the emergency unlock**, once a day: 15 minutes of every app, two taps plus a confirm.
4. **Never get stuck.** If the service dies, a permission is revoked or the engine goes silent for 3 minutes, everything opens (fail-open). Going offline or changing the clock never unblocks.
5. **Rely on always-open apps.** Calls, SMS, maps, banking, health, camera, clock, settings, plus 2 messaging apps they pick, are never blocked.
6. **Set up in four steps:** meet the weather, grant six permissions (never blocking progress), set home, and pick distracting apps plus up to 2 always-open messaging apps.
7. **Manage distracting apps:** adding one applies at once; removing one takes 12 hours.
8. **Get the right notifications:** a persistent weather + umbrella-time notification, morning and noon plan reminders, a 10-minute block warning, weather changes, "free time's up", low umbrella time, quest auto-verified.
9. **See their Forecast:** a week of weather-icon days, goals, distractions, umbrella time and emergency unlocks (Month and 6 months are P1).

A also owns the look (`src/ui/`): weather theme tokens, weather names and shared components.

## Owns

| Path | What |
| --- | --- |
| `src/device/index.ts` | `USE_REAL` flag; real/fake factory |
| `src/device/fakes.ts` | UsageFeed + DeviceSignals fakes with scripted tracks (scroll, screen-off, walk away, mocked GPS) |
| `src/device/native/appBlocker.ts` | Wrapper over `expo-app-blocker` |
| `src/device/screens/StormScreen.tsx` | Route `blocked`, which the blocker deep-links to: `toll://blocked?app=&package=&reason=opened\|expired` |
| `src/device/screens/Onboarding.tsx` | Route `onboarding` |
| `src/device/screens/ForecastScreen.tsx` | Forecast tab |
| `src/device/screens/RestrictedAppsSection.tsx` | Section inside C's Settings |
| `src/ui/*` | `theme.ts`, `weather.ts` (the only place posture becomes weather words), `components.tsx` |

## Interfaces

| Direction | Interface | Counterpart | Test with until integration |
| --- | --- | --- | --- |
| Provides | `UsageFeed`, `DeviceSignals`, `Debug` | C (feed), B (signals) | A's own debug controls in `fakes.ts` |
| Consumes | `PostureSource`, `Clock` | C | Engine fake; demo panel buttons set the weather and free time |
| Consumes | `Ledger`, `Governor` | C | Ledger fake (Storm rule, 180 days of history); one emergency unlock a day |
| Consumes | `Planner`, `Quests` | B | Plan and no-plan seeds; stub quest sheet |
| Hosts | `SetHomeStep` | B | Its placeholder |

## Tasks

| ID | Task | Done when | Est | Pri |
| --- | --- | --- | --- | --- |
| A1 | Dev build and hour-0 shell | `npm run android` installs on both demo phones; the router shows every placeholder | 1h | P0 |
| A2 | Foreground service + `UsageFeed` | Logs the foreground package once a second; `onSample`/`onIntercept` fire; survives 10 min of screen-off | 1.5h | P0 |
| A3 | Overlay blocking (**hour-3 gate**) | Fake weather on Storm → opening Instagram shows the Storm screen within 1 s, 10 times running, on the demo phone | 2h | P0 |
| A4 | Weather matrix and windows | Pure `isAllowed(app, posture, windows)` passes tests for all 9 cells, the 2 messaging apps, open and expired windows | 1h | P0 |
| A5 | Emergency unlock + fail-open (**hour-4 gate**) | Two taps + confirm call `Governor.emergencyUnlock()`; a second try says "Back tomorrow". Dead service, revoked permission or `PostureState` older than 3 min opens everything; offline or clock change does not | 1h | P0 |
| A6 | Storm screen | All design states render: Cloudy ± umbrella, Storm, emergency used, clouds-gathering banner; each choice calls its interface; closes when a window opens | 2.5h | P0 |
| A7 | Onboarding | Four steps; six permission dots poll on resume; B's `SetHomeStep`; app grid + 2 messaging apps; sleep defaults 23:00–07:00 | 2.5h | P0 |
| A8 | Distracting-app list + 12-hour removal | Add applies at once; remove applies after 12 h of fake clock; section renders in Settings | 1h | P0 |
| A9 | `DeviceSignals` bridge | Screen on/off events; a location sample every 60 s; `mocked` true under a mock-location app | 2h | P0 |
| A10 | Notifications | Persistent notification + the six moments each fire from their fake source | 1.5h | P0 |
| A11 | Forecast, week view | Calendar, goals, distractions, umbrella, emergency unlocks from `Ledger.history()`, incl. no-plan and first-days states | 1.5h | P0 |
| A12 | Polish | Storm screen, sky scene and mascot match Visual language + Accessibility; reduce-motion respected | 1.5h | P1 |
| A13 | Forecast Month + 6 months | Range switcher with one plain-words trend line per chart | 1h | P1 |

## Rules A implements (planning doc sections)

Restriction tiers (matrix, Essential list, 12-hour delay, mobile browser scope) · The Sealed rule (Open umbrella hidden in Storm) · Scoring → Hold and grace (banner) · How blocks lift → Safety (always-open apps, emergency unlock, fail-open) · UI and UX design: Screens 1, 4, 6, Notifications, Visual language, Accessibility · Feasibility: Android path, risks 1–2.

## Integration

A flips `src/device/index.ts` at **step 2**, after C. It must pass:
- S1: the class block brings a storm
- S5: emergency unlock once a day
- S6: fail-open, and offline does not unblock
- S9: free time, then Cloudy
- S8: offline

After the flip:
- **C sees** real foreground samples, so free time, scroll velocity and the urge count become real.
- **B sees** real screen and location events.
- **A sees** computed weather, the real ledger and quest sheet, and real Forecast data.

## Known risk (found while scaffolding)

`expo-app-blocker` runs its own foreground service declared `foregroundServiceType="specialUse"`. The plan assumed location sampling could share a `location`-type service. By hour 3, confirm how background location will run (expo-location's own foreground service is the likely route) before B6 depends on it.

## Out of scope

Computing the score, weather, free time or reasons (C) · ledger maths, reset, day summaries, sync (C) · Settings container (C) · verification, Plan my day, Today (B) · AWS, pairing, extension (C) · iOS (cut).
