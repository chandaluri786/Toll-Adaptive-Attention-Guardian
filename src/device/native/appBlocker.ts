// OWNER: A (Spec A, tasks A2, A3). The real BlockerPort, over expo-app-blocker (pinned 0.1.78).
//
// !! NOT VERIFIED ON A PHONE !!  Written against the package's README and types. The hour-3 gate
// (opening Instagram shows our Storm screen within 1 s, 10 times running) is what proves it.
//
// How the package works on Android (from its README):
//   - A foreground service polls UsageStatsManager and flashes a system overlay over any app on the
//     blocked list, then opens THIS app with a deep link: toll://blocked?app=<Name>&package=<pkg>&reason=
//     opened|expired. expo-router sends that to src/app/blocked.tsx (the Storm screen).
//   - temporaryUnlock(minutes) pauses blocking; on Android its budget ticks down while a blocked app is
//     in use. That is how UsageMeter measures restricted-app use (see usageMeter.ts, enforcer.ts).
//   - Permissions: usage access and "display over other apps" open a system settings page with no
//     callback, so the app re-checks when it returns to the foreground (kit.ts).
//
// Only import this file from real-device code paths (it needs a dev build, not Expo Go or Jest).
import * as Blocker from 'expo-app-blocker';
import type { BlockerPort } from '../ports';

/** The brief native overlay before our own screen opens: calm, on-brand, no red. */
const OVERLAY = {
  overlayTitle: 'Toll',
  overlayText: 'Checking the weather…',
  overlayBackgroundColor: '#1A1440', // Storm indigo
  overlayTitleColor: '#F4F1FF',
  overlayTextColor: '#C9C2FF',
} as const;

type NotificationConfig = { notificationTitle: string; notificationText: string };

// The package's native setAndroidConfig writes EVERY key on each call: a key left out is stored as null
// and falls back to the package default (the white "App Blocked" overlay). So we keep the whole config
// here and always send all of it. Note: these notification keys are the one shown on each intercept
// (the package's foreground-service notification is fixed native text and cannot be changed from JS).
let notification: NotificationConfig = { notificationTitle: 'Toll', notificationText: 'Watching the weather' };

const sendConfig = (n: NotificationConfig) => Blocker.configureAndroid({ ...OVERLAY, ...n });

export function configureOverlay(): void {
  sendConfig(notification);
}

/** Updates the notification text, keeping the overlay. Returns false when nothing changed (no native call). */
function updateNotification(title: string, text: string): boolean {
  if (notification.notificationTitle === title && notification.notificationText === text) return false;
  const next = { notificationTitle: title, notificationText: text };
  sendConfig(next); // if this throws, `notification` keeps the old value so the next call retries
  notification = next;
  return true;
}

export function createNativeBlocker(): BlockerPort {
  // Native calls can throw if the service is not ready or a permission is missing. Enforcement must
  // never crash the app, and fail-open (failOpen.ts) is what protects the user, so errors are logged.
  const safe = <T,>(label: string, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      console.warn(`[toll] blocker.${label} failed`, e);
      return fallback;
    }
  };

  return {
    setBlockedApps: (pkgs) => safe('setBlockedApps', () => Blocker.setBlockedApps(pkgs), undefined),
    startMonitoring: () => safe('startMonitoring', () => Blocker.startMonitoring(), undefined),
    stopMonitoring: () => safe('stopMonitoring', () => Blocker.stopMonitoring(), undefined),
    temporaryUnlock: (minutes) => void Blocker.temporaryUnlock(minutes).catch((e) => console.warn('[toll] blocker.temporaryUnlock failed', e)),
    relock: () => void Blocker.relockApps().catch((e) => console.warn('[toll] blocker.relock failed', e)),
    remainingUnlockSeconds: () => safe('remainingUnlockSeconds', () => Blocker.getRemainingUnlockTime(), 0),
    drainIntercepts: () => safe('drainIntercepts', () => Blocker.drainPendingIntercepts(), []),
    setNotificationText: (title, text) =>
      safe('setNotificationText', () => void updateNotification(title, text), undefined),
  };
}

export {
  getInstalledApps,
  openOverlaySettings,
  openUsageStatsSettings,
  getPermissionStatus,
} from 'expo-app-blocker';
