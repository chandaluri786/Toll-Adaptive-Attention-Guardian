# Toll — Adaptive Attention Guardian

Toll gates distracting apps behind verified real-world accomplishment. Your phone has **weather**: Clear skies, Cloudy or Storm, set automatically from your day. Earned minutes are **umbrella time**. Built for SunHacks Fall 2026.

- Planning doc (product rules, specs, contract): https://claude.ai/artifact/A3B1LtX6YVTR43D3Uao8br
- Approved visual design (state gallery): https://claude.ai/artifact/6W9BYCvTubVmr9SMrv143m

The doc is the single source for product rules (numbers, thresholds, copy). This repo holds the code, and `docs/` restates what each person builds.

**New to the team? Start with [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**: setup, hour-0 steps, where each person starts, the timeline and integration.

## Design

Every screen must match the approved design. The rules (colours, type, icons, the cloud mascot, motion, copy) and a screen-to-owner map live in **[docs/DESIGN.md](docs/DESIGN.md)**; reference images of every state are in [`docs/design/`](docs/design/). Shared UI is in `src/ui/` (owned by A): import it, do not copy it.

## Quick start

```bash
npm install
npm run check        # typecheck + tests, must stay green on main
npm run android      # dev build on a connected Android phone (Expo Go will not work: native modules)
```

### Without an Android phone

```bash
npm run web            # dev server with hot reload (react-native-web)
npm run preview:web    # export once and serve at http://localhost:4173
```

The native blocker, usage stats and sensors only exist on Android, so the web preview runs on the fakes. It is for looking at screens and trying the flows, not for proving the real blocker.

The app runs entirely on **fakes** until each owner flips their flag, so every screen works from day one.

## Who owns what

Each person writes only inside their own folders. Shared files are written at hour 0 and then frozen.

| Path | Owner | What it delivers to the user |
| --- | --- | --- |
| `src/contracts.ts` | All three, frozen at 1:30 | The only surface between A, B and C: types and interfaces |
| `src/services.ts`, `src/shared/`, `src/app/` | All three, hour 0 only | Wiring (real or fake per folder), hooks, and routes that import each owner's screens |
| `src/device/` | **A — Device** | Distracting apps are intercepted with the Storm screen; onboarding; notifications; the Forecast tab; emergency unlock; fail-open |
| `src/ui/` | **A** (after hour 0) | The weather look: theme tokens, weather names, shared components |
| `src/day/` | **B — Day & quests** | Optional Plan my day + reminders, the Today tab, quests and all six verifiers, the quest sheet |
| `cloud/quiz/` | **B** (P1) | Study quizzes generated from the day's topics |
| `src/engine/` | **C — Engine, money, cloud** | The weather itself: Focus Pressure, free time, transitions, emergency-unlock rules; demo panel; Settings |
| `src/ledger/` | **C** | Umbrella time: earning, spending, the 04:00 reset, daily history for Forecast, sync |
| `cloud/ledger/` | **C** | The whole server: wallet IDs and minute counts, nothing else |
| `extension/` | **C** | Chrome extension: the same umbrella time on the laptop |

Specs, with every task, done-when and interface:
- [docs/specs/A-device.md](docs/specs/A-device.md)
- [docs/specs/B-day-quests.md](docs/specs/B-day-quests.md)
- [docs/specs/C-engine-cloud.md](docs/specs/C-engine-cloud.md)
- [docs/contract.md](docs/contract.md): interfaces, fakes, integration order, scenarios S1–S9, gates

## Real or fake

Each owned folder's `index.ts` has a `USE_REAL` flag. Integration (hours 10–14) is three flips, in this order:

1. C sets `USE_REAL = true` in `src/engine/index.ts` and `src/ledger/index.ts`, then runs S2 and S5.
2. A sets it in `src/device/index.ts`, then runs S1 and S6.
3. B sets it in `src/day/index.ts`, then runs S3 and S4.

After that, the whole team runs S7, S8, S9 and S1–S6 again.

## House rules

- **Contract changes** need all three people and land as one commit that updates every fake.
- **Time** is always `services.clock.now()`, never `Date.now()`, or the demo panel cannot move it.
- **New native dependencies** are announced first, because everyone has to rebuild the dev build.
- **Storage** stays on the phone. Each folder writes only its own key prefix: `device:`, `day:`, `engine:`, `ledger:`.
- **Copy:** users see weather words, never "posture", "blocked" or "failed". No red anywhere.
- **Keep `npm run check` green on main.**

## Stack

Expo SDK 58 · React Native 0.88 · Expo Router · TypeScript 6 · Jest (jest-expo) · react-native-web (browser preview).

Native modules: `expo-app-blocker` (pinned 0.1.78; Android usage stats and overlay), expo-sensors, expo-location, expo-camera, expo-notifications, expo-font, `@react-native-ml-kit/text-recognition`, react-native-mmkv, react-native-svg.

JS libraries: `lucide-react-native` (icons), `@expo-google-fonts/cormorant-garamond` and `@expo-google-fonts/roboto` (fonts), react-native-web.

### Requirements

- **Node 22.13 or newer.** Older Node fails with `URL.parse is not a function`.
- **JDK 17 for Android builds.** Newer JDKs (for example the one bundled with Android Studio, JDK 25) break `expo-app-blocker`. On macOS: `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`. On Linux, point `JAVA_HOME` at your JDK 17 install. Then `cd android && ./gradlew --stop` and `npx expo run:android`.
- **After pulling new native dependencies** (the design commit added expo-notifications, expo-font and react-native-svg), rebuild the dev build: `npx expo run:android`. Web preview needs no rebuild.
