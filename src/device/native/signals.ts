// OWNER: A (Spec A, task A9). The real DeviceSignals: location samples for B's away-from-home quest.
//
// !! NOT VERIFIED ON A PHONE !!  And two honest gaps, both flagged in docs/specs/A-device.md:
//
//   1. SCREEN ON/OFF is NOT implemented. React Native and Expo have no screen-state event, and the
//      only reliable source is an Android BroadcastReceiver for ACTION_SCREEN_ON / ACTION_SCREEN_OFF,
//      which needs a small custom Expo module in Kotlin. `onScreen` therefore never emits, so B's
//      screen-off verifier (the "phone down 25 minutes" quest) cannot pass on a phone yet. We did not
//      fake it with AppState: "app in background" is not "screen off", and a wrong signal would
//      silently pay out minutes. Writing that module untested risked breaking everyone's dev build.
//
//   2. BACKGROUND location is NOT set up. This uses a foreground watch, which Android stops when the
//      app is not visible. A 45-minute away-from-home quest needs a foreground service. expo-app-blocker's
//      own service is declared type "specialUse" and cannot carry location. The likely route is
//      expo-location's startLocationUpdatesAsync with its `foregroundService` option (needs
//      expo-task-manager). Decide this by hour 3.
import * as Location from 'expo-location';
import type { DeviceSignals, GetServices, LocationSample } from '../../contracts';
import { createEmitter } from '../../shared/emitter';

const SAMPLE_EVERY_MS = 60_000;
/** Treated as "too inaccurate to trust": B's verifier requires accuracy <= 100 m. */
const UNKNOWN_ACCURACY_M = 9_999;

export function createNativeSignals(get: GetServices): DeviceSignals {
  const screen = createEmitter<{ at: number; on: boolean }>();
  const locations = createEmitter<LocationSample>();
  let subscription: Location.LocationSubscription | null = null;
  let starting = false;

  return {
    onScreen: (fn) => screen.on(fn), // never emits: see gap 1 above

    startLocation() {
      if (subscription || starting) return; // already running (or about to be)
      starting = true;
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: SAMPLE_EVERY_MS, distanceInterval: 0 },
        (l) =>
          locations.emit({
            at: get().clock.now(),
            lat: l.coords.latitude,
            lon: l.coords.longitude,
            accuracyM: l.coords.accuracy ?? UNKNOWN_ACCURACY_M,
            mocked: l.mocked === true, // Android's isFromMockProvider(): the whole mock-location defence
          }),
      )
        .then((s) => {
          subscription = s;
        })
        .catch((e) => console.warn('[toll] location watch failed', e))
        .finally(() => {
          starting = false;
        });
    },

    stopLocation() {
      subscription?.remove();
      subscription = null;
    },

    onLocation: (fn) => locations.on(fn),
  };
}
