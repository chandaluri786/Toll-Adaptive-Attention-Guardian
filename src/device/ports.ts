// OWNER: A (Spec A). "Ports": the narrow interfaces between A's logic and the outside world.
//
// Each port has two implementations:
//   - real:  src/device/native/*  (talks to expo-app-blocker, expo-notifications, expo-location ...)
//   - fake:  src/device/fakes.ts   (records calls, used by tests, the browser preview and the gallery)
// Logic files (policy, enforcer, usageMeter, notifications ...) only ever see these interfaces, which
// is why they run unchanged in Jest and in a browser with no Android phone.

// ---- blocking (expo-app-blocker) -------------------------------------------------------------

export type InterceptRecord = { appName: string | null; interceptedAt: number };

/**
 * What the Enforcer needs from the blocker. Note the blocker's two real limits:
 *  - it blocks whatever is on its list; "unlock" pauses blocking for ALL listed apps at once, so a
 *    window scoped to one class also lets other listed classes through while it lasts;
 *  - its unlock budget is USAGE time (it ticks down only while a blocked app is in use), which is
 *    what UsageMeter reads to see how long restricted apps were used.
 */
export interface BlockerPort {
  setBlockedApps(packages: string[]): void;
  startMonitoring(): void;
  stopMonitoring(): void;
  /** Pause blocking for `minutes` of usage. Replaces any active unlock. */
  temporaryUnlock(minutes: number): void;
  /** End an active unlock now and block again. Safe to call when nothing is unlocked. */
  relock(): void;
  /** Seconds left on the active unlock, 0 if none. */
  remainingUnlockSeconds(): number;
  /** Block events recorded natively since the last call. */
  drainIntercepts(): InterceptRecord[];
  /** Text of the persistent foreground-service notification (weather + umbrella time). */
  setNotificationText(title: string, text: string): void;
}

// ---- permissions -----------------------------------------------------------------------------

export type PermissionId = 'usage' | 'overlay' | 'notifications' | 'location' | 'camera' | 'motion';

/** Order and copy match the approved design (onboarding step 2). `needed` = blocking cannot work without it. */
export const PERMISSIONS: readonly { id: PermissionId; name: string; why: string; needed: boolean }[] = [
  { id: 'usage', name: 'Usage access', why: 'See which app is open', needed: true },
  { id: 'overlay', name: 'Display over apps', why: 'Show the sky over distracting apps', needed: true },
  { id: 'notifications', name: 'Notifications', why: 'Heads-ups before the weather turns', needed: false },
  { id: 'motion', name: 'Physical activity', why: 'Count steps for walking quests', needed: false },
  { id: 'location', name: 'Location', why: "Check you're away from home", needed: false },
  { id: 'camera', name: 'Camera', why: 'Read meetup codes', needed: false },
];

export type PermissionStatus = Record<PermissionId, boolean>;

export interface PermissionsPort {
  status(): Promise<PermissionStatus>;
  /** Ask for it, or open the system settings page for it. There is no callback: callers re-check on resume. */
  request(id: PermissionId): Promise<void>;
}

/** Fail-open input: the two permissions blocking cannot work without. */
export const hasBlockingPermissions = (s: PermissionStatus) => s.usage && s.overlay;

// ---- installed apps (onboarding + Settings pickers) ------------------------------------------

export type InstalledApp = { pkg: string; name: string };
export interface InstalledAppsPort {
  list(): Promise<InstalledApp[]>;
}

// ---- notifications (task A10) ----------------------------------------------------------------

export type NoticeKind =
  | 'plan_morning'
  | 'plan_noon'
  | 'block_soon'
  | 'weather_change'
  | 'free_time_used'
  | 'umbrella_low'
  | 'quest_verified';

/** `actions` are the buttons on the notification (the plan reminders offer "Plan" and "Not today"). */
export type Notice = { kind: NoticeKind; title: string; body: string; at: number; actions?: string[] };

export interface Notifier {
  show(notice: Notice): void | Promise<void>;
}
