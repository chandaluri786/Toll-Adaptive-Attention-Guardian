// OWNER: A (Spec A). Fake versions of every port in ports.ts. They behave like the real thing closely
// enough that the tests, the browser preview and the gallery exercise the same code paths as a phone.
import { createEmitter } from '../shared/emitter';
import type {
  BlockerPort,
  InstalledApp,
  InstalledAppsPort,
  InterceptRecord,
  Notice,
  Notifier,
  PermissionId,
  PermissionStatus,
  PermissionsPort,
} from './ports';

/** A blocker that records every call and lets a test "use an app" to drain the unlock budget. */
export function createFakeBlocker() {
  const calls: string[] = [];
  let blocked: string[] = [];
  let monitoring = false;
  let unlockSeconds = 0;
  let intercepts: InterceptRecord[] = [];
  let notification = { title: '', text: '' };

  const blocker: BlockerPort & {
    /** Test/gallery controls */
    calls: string[];
    blockedApps(): string[];
    isMonitoring(): boolean;
    notification(): { title: string; text: string };
    simulateUse(seconds: number): void;
    simulateIntercept(appName: string, at: number): void;
    clearCalls(): void;
  } = {
    calls,
    setBlockedApps(pkgs) {
      blocked = [...pkgs];
      calls.push(`setBlockedApps(${pkgs.length})`);
    },
    startMonitoring() {
      monitoring = true;
      calls.push('startMonitoring');
    },
    stopMonitoring() {
      monitoring = false;
      calls.push('stopMonitoring');
    },
    temporaryUnlock(minutes) {
      unlockSeconds = Math.max(1, Math.round(minutes)) * 60;
      calls.push(`temporaryUnlock(${Math.max(1, Math.round(minutes))})`);
    },
    relock() {
      unlockSeconds = 0;
      calls.push('relock');
    },
    remainingUnlockSeconds: () => unlockSeconds,
    drainIntercepts() {
      const out = intercepts;
      intercepts = [];
      return out;
    },
    setNotificationText(title, text) {
      notification = { title, text };
    },
    blockedApps: () => blocked,
    isMonitoring: () => monitoring,
    notification: () => notification,
    /** Like the real blocker: the budget only ticks down while an unlock is active. */
    simulateUse(seconds) {
      unlockSeconds = Math.max(0, unlockSeconds - seconds);
    },
    simulateIntercept(appName, at) {
      intercepts.push({ appName, interceptedAt: at });
    },
    clearCalls() {
      calls.length = 0;
    },
  };
  return blocker;
}

export type FakeBlocker = ReturnType<typeof createFakeBlocker>;

/** Permissions the user can grant one by one, like the real checklist. */
export function createFakePermissions(initial: Partial<PermissionStatus> = {}) {
  let state: PermissionStatus = {
    usage: false,
    overlay: false,
    notifications: false,
    location: false,
    camera: false,
    motion: false,
    ...initial,
  };
  const changes = createEmitter<void>();
  const port: PermissionsPort & { set(id: PermissionId, granted: boolean): void; onChange(fn: () => void): () => void } = {
    status: async () => ({ ...state }),
    // The real flow opens a system settings page and the user flips a switch. The fake grants at once.
    request: async (id) => {
      state = { ...state, [id]: true };
      changes.emit();
    },
    set(id, granted) {
      state = { ...state, [id]: granted };
      changes.emit();
    },
    onChange: (fn) => changes.on(() => fn()),
  };
  return port;
}

export const FAKE_APPS: InstalledApp[] = [
  { pkg: 'com.instagram.android', name: 'Instagram' },
  { pkg: 'com.zhiliaoapp.musically', name: 'TikTok' },
  { pkg: 'com.snapchat.android', name: 'Snapchat' },
  { pkg: 'com.reddit.frontpage', name: 'Reddit' },
  { pkg: 'com.google.android.youtube', name: 'YouTube' },
  { pkg: 'com.twitter.android', name: 'X' },
  { pkg: 'com.facebook.katana', name: 'Facebook' },
  { pkg: 'com.whatsapp', name: 'WhatsApp' },
  { pkg: 'org.telegram.messenger', name: 'Telegram' },
  { pkg: 'com.google.android.gm', name: 'Gmail' },
  { pkg: 'com.android.chrome', name: 'Chrome' },
  { pkg: 'com.spotify.music', name: 'Spotify' },
];

export function createFakeInstalledApps(apps: InstalledApp[] = FAKE_APPS): InstalledAppsPort {
  return { list: async () => apps };
}

/** Collects notices so tests can assert on them and the gallery can show them. */
export function createFakeNotifier() {
  const log: Notice[] = [];
  const changes = createEmitter<Notice>();
  const notifier: Notifier & { log: Notice[]; onNotice(fn: (n: Notice) => void): () => void; clear(): void } = {
    log,
    show(notice) {
      log.push(notice);
      changes.emit(notice);
    },
    onNotice: (fn) => changes.on(fn),
    clear() {
      log.length = 0;
    },
  };
  return notifier;
}
