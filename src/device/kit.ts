// OWNER: A (Spec A). The "device kit": builds everything A owns from a set of ports, and runs it.
//
// Both the fake device (browser preview, tests) and the real device (a phone) are made by this one
// function with different ports. So the code that decides what to block, when to fail open and which
// notifications to send is the SAME code in both: what the browser preview shows is what the phone does.
//
// `start()` is called once by <DeviceRuntime /> (src/device/DeviceRuntime.tsx) when the app mounts.
import { AppState } from 'react-native';
import type { GetServices, Unsub } from '../contracts';
import { createAppConfig, type AppConfig } from './appConfig';
import { createEnforcer, type Enforcer } from './enforcer';
import { FAKE_APPS } from './fakePorts';
import { createFailOpenGuard } from './failOpen';
import { createNotificationRouter, type NotificationRouter } from './notifications';
import type { BlockerPort, InstalledAppsPort, Notifier, PermissionStatus, PermissionsPort } from './ports';
import { type KeyValueStore, KEY_PREFIX } from './storage';
import type { UsageMeter } from './usageMeter';

export type DevicePorts = {
  blocker: BlockerPort;
  permissions: PermissionsPort;
  installedApps: InstalledAppsPort;
  notifier: Notifier;
  store: KeyValueStore;
  /** Real device only: converts the blocker's unlock budget into the UsageFeed. */
  meter?: UsageMeter;
};

const ONBOARDED_KEY = `${KEY_PREFIX}onboarded`;

/** How often the runtime re-checks everything. The timer lets fail-open notice a silent engine. */
export const ENFORCE_EVERY_MS = 10_000;
export const METER_EVERY_MS = 1_000;
export const PERMISSIONS_EVERY_MS = 15_000;

export function createDeviceKit(ports: DevicePorts, get: GetServices) {
  const { store } = ports;
  const config = createAppConfig(store, () => get().clock.now());
  const guard = createFailOpenGuard();

  // Caches so the (synchronous) enforcer never waits on an async native call.
  let permissionsCache: PermissionStatus | null = null;
  let installedCache: string[] = FAKE_APPS.map((a) => a.pkg);

  const enforcer: Enforcer = createEnforcer({
    blocker: ports.blocker,
    guard,
    posture: { get: () => get().postureSource.get() },
    ledger: { activeWindows: () => get().ledger.activeWindows() },
    config: () => config.classification(),
    installedPackages: () => installedCache,
    now: () => get().clock.now(),
    permissions: () => permissionsCache,
    onApply: () => ports.meter?.rebase(), // the unlock was replaced: do not count the jump as usage
  });

  const notifications: NotificationRouter = createNotificationRouter({
    clock: { now: () => get().clock.now(), onTick: (fn) => get().clock.onTick(fn) },
    posture: { get: () => get().postureSource.get(), subscribe: (fn) => get().postureSource.subscribe(fn) },
    ledger: {
      balance: () => get().ledger.balance(),
      activeWindows: () => get().ledger.activeWindows(),
      onChange: (fn) => get().ledger.onChange(fn),
    },
    planner: { remindersDue: (t) => get().planner.remindersDue(t), nextBlock: (t) => get().planner.nextBlock(t) },
    quests: { onVerified: (fn) => get().quests.onVerified(fn) },
    notifier: ports.notifier,
    store,
    blocker: ports.blocker,
  });

  const refreshPermissions = async () => {
    try {
      permissionsCache = await ports.permissions.status();
    } catch {
      permissionsCache = null; // unknown is never a reason to block anyone
    }
    enforcer.tick();
  };

  return {
    config,
    enforcer,
    notifications,
    permissions: ports.permissions,
    installedApps: ports.installedApps,
    notifier: ports.notifier,
    blocker: ports.blocker,
    store,
    onboarding: {
      isDone: () => store.get(ONBOARDED_KEY) === '1',
      markDone: () => store.set(ONBOARDED_KEY, '1'),
    },
    /** Latest permission status, or null until the first check finishes. */
    permissionStatus: () => permissionsCache,
    refreshPermissions,

    /** Start everything. Returns one function that stops it all. */
    start(): Unsub {
      const tick = () => void enforcer.tick();
      const subs: Unsub[] = [
        notifications.start(),
        get().postureSource.subscribe(tick),
        get().ledger.onChange(tick),
        config.onChange(tick),
      ];

      ports.installedApps
        .list()
        .then((apps) => {
          installedCache = apps.map((a) => a.pkg);
          tick();
        })
        .catch(() => undefined); // keep the cached list; blocking just uses what it already knows

      void refreshPermissions();
      tick();
      notifications.check();

      const timers = [
        setInterval(tick, ENFORCE_EVERY_MS),
        setInterval(() => ports.meter?.poll(), METER_EVERY_MS),
        setInterval(() => void refreshPermissions(), PERMISSIONS_EVERY_MS),
      ];
      // Usage / overlay permissions open a settings page with no callback: re-check when the app returns.
      const appState = AppState.addEventListener('change', (s) => s === 'active' && void refreshPermissions());

      return () => {
        subs.forEach((u) => u());
        timers.forEach(clearInterval);
        appState.remove();
      };
    },
  };
}

export type DeviceKit = ReturnType<typeof createDeviceKit>;
