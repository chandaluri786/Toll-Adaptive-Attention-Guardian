// OWNER: A (Spec A, task A4). The whole enforcement policy as pure functions: no React, no native
// code, fully unit-tested (src/device/__tests__/policy.test.ts).
//
// Two axes that must stay separate (planning doc, "Restriction tiers"):
//   - an APP has a fixed class: essential | discretionary | restricted
//   - the SYSTEM has a current posture (the weather): open | metered | sealed
// The matrix below is the entire policy:
//
//                    open (Clear)   metered (Cloudy)        sealed (Storm)
//   essential        open           open                    open
//   discretionary    open           open, logged            costs minutes (1 min buys 2)
//   restricted       open           costs minutes (1:1)     quest-earned minutes only
//
// Users see weather words; this file keeps the internal names.
import type { AccessWindow, AppClass, Posture } from '../contracts';

/** Packages that are always open, whatever the weather. Defined by the product, not editable. */
export const ESSENTIAL_PACKAGES: readonly string[] = [
  'com.google.android.dialer',
  'com.android.dialer',
  'com.samsung.android.dialer',
  'com.google.android.apps.messaging', // default SMS (Google Messages)
  'com.samsung.android.messaging', // default SMS (Samsung)
  'com.android.mms',
  'com.google.android.apps.maps',
  'com.google.android.deskclock', // clock and alarms
  'com.android.deskclock',
  'com.android.settings',
  'com.android.camera',
  'com.google.android.GoogleCamera',
  'com.google.android.apps.healthdata', // health
  'com.android.emergency',
  'com.google.android.apps.safetyhub',
];

/** Messaging apps that are Discretionary by default (the user may promote up to 2 to always-open). */
export const DISCRETIONARY_DEFAULTS: readonly string[] = [
  'com.whatsapp',
  'org.telegram.messenger',
  'com.google.android.gm', // email
  'com.google.android.youtube',
  'com.android.chrome', // browser
  'com.spotify.music',
];

/** Packages suggested as distracting during onboarding ("the usual suspects"). */
export const SUGGESTED_RESTRICTED: readonly string[] = [
  'com.instagram.android',
  'com.zhiliaoapp.musically', // TikTok
  'com.snapchat.android',
  'com.facebook.katana',
  'com.twitter.android',
  'com.reddit.frontpage',
  'com.google.android.youtube',
];

export const MAX_MESSAGING_APPS = 2;

/** What the user has configured. Persisted by AppConfigStore (appConfig.ts). */
export type AppClassification = {
  restricted: ReadonlySet<string>;
  /** Up to MAX_MESSAGING_APPS messaging apps the user keeps always-open. */
  alwaysOpen: ReadonlySet<string>;
  /** Apps with their own Discretionary class (browser, email, music ...). */
  discretionary: ReadonlySet<string>;
};

/** The class of one package. Essential wins, so a user can never gate the phone's safety apps. */
export function classify(pkg: string, config: AppClassification): AppClass {
  if (ESSENTIAL_PACKAGES.includes(pkg) || config.alwaysOpen.has(pkg)) return 'essential';
  if (config.restricted.has(pkg)) return 'restricted';
  if (config.discretionary.has(pkg) || DISCRETIONARY_DEFAULTS.includes(pkg)) return 'discretionary';
  return 'essential'; // unknown apps are never blocked: fail toward access, not lock-out
}

/** What should happen when an app of this class opens under this weather. */
export type Decision =
  | { kind: 'allow'; logged: boolean }
  | {
      kind: 'intercept';
      /** Show the "Open umbrella" choice? Cloudy restricted, or Storm discretionary. */
      canSpend: boolean;
      /** Minutes of access one minute of umbrella time buys (1, or 2 for discretionary in Storm). */
      spendRate: 1 | 2;
      /** Show the "Take a quest" choice as the primary way out? True in a Storm. */
      questPrimary: boolean;
    };

/** True if a window covers this app class right now. */
export function windowCovers(w: AccessWindow, appClass: AppClass, now: number): boolean {
  if (w.until <= now) return false;
  if (typeof w.scope === 'object') return false; // domain windows belong to the extension
  return w.scope === 'all' || w.scope === appClass;
}

/** Task A4: should this app open right now? One cell of the matrix, plus open windows. */
export function isAllowed(
  appClass: AppClass,
  posture: Posture,
  windows: readonly AccessWindow[],
  now: number,
): Decision {
  if (appClass === 'essential') return { kind: 'allow', logged: false };
  if (posture === 'open') return { kind: 'allow', logged: false };
  if (windows.some((w) => windowCovers(w, appClass, now))) return { kind: 'allow', logged: false };

  if (appClass === 'discretionary') {
    return posture === 'metered'
      ? { kind: 'allow', logged: true } // Cloudy: free, but logged
      : { kind: 'intercept', canSpend: true, spendRate: 2, questPrimary: false };
  }
  // restricted
  return posture === 'metered'
    ? { kind: 'intercept', canSpend: true, spendRate: 1, questPrimary: false }
    : { kind: 'intercept', canSpend: false, spendRate: 1, questPrimary: true }; // Storm: quest only
}

/**
 * Task A3: the package list handed to the blocker for this weather. The blocker blocks whatever is
 * on its list, so the list changes with the weather: nothing when clear, restricted apps when
 * Cloudy, restricted + discretionary in a Storm. Essential apps are never on it.
 */
export function computeBlocklist(
  posture: Posture,
  config: AppClassification,
  installed: readonly string[],
): string[] {
  if (posture === 'open') return [];
  const wanted = new Set<AppClass>(posture === 'metered' ? ['restricted'] : ['restricted', 'discretionary']);
  return installed.filter((pkg) => wanted.has(classify(pkg, config)));
}
