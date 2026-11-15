// OWNER: A (task A5). Fail-open through the whole kit: a lost blocking permission turns the blocker off.
import type { GetServices, PostureState } from '../../contracts';
import { createFakeBlocker, createFakeInstalledApps, createFakeNotifier, createFakePermissions } from '../fakePorts';
import { createDeviceKit } from '../kit';
import type { PermissionsPort } from '../ports';
import { createMemoryStore } from '../storage';

const NOW = 5_000_000;
const REDDIT = 'com.reddit.frontpage';
const cloudy: PostureState = { posture: 'metered', score: 0, reason: '', reasonCode: 'none', nextChange: null, grace: false, allowanceLeftMin: 0, computedAt: 1 };

function setup() {
  const blocker = createFakeBlocker();
  const permissions = createFakePermissions({ usage: true, overlay: true });
  let statusFails = false;
  const port: PermissionsPort = {
    status: () => (statusFails ? Promise.reject(new Error('service not ready')) : permissions.status()),
    request: permissions.request,
  };
  const never = () => () => undefined;
  const services = {
    clock: { now: () => NOW, onTick: never },
    postureSource: { get: () => cloudy, subscribe: never },
    ledger: { balance: () => 0, activeWindows: () => [], onChange: never },
    planner: { remindersDue: () => null, nextBlock: () => null },
    quests: { onVerified: never },
  };
  const kit = createDeviceKit(
    { blocker, permissions: port, installedApps: createFakeInstalledApps(), notifier: createFakeNotifier(), store: createMemoryStore() },
    (() => services) as unknown as GetServices,
  );
  kit.config.addRestricted(REDDIT);
  return { kit, blocker, permissions, failStatus: () => (statusFails = true) };
}

describe('device kit fail-open', () => {
  it('turns blocking off when "Display over apps" is revoked', async () => {
    // Arrange
    const t = setup();
    await t.kit.refreshPermissions();
    expect(t.blocker.blockedApps()).toEqual([REDDIT]);

    // Act
    t.permissions.set('overlay', false);
    await t.kit.refreshPermissions();

    // Assert
    expect(t.kit.enforcer.current()).toEqual({ mode: 'off', reason: 'permission_revoked' });
    expect(t.blocker.blockedApps()).toEqual([]);
    expect(t.blocker.isMonitoring()).toBe(false);
  });

  it('stays off when a later permission check fails, instead of blocking again blind', async () => {
    // Arrange
    const t = setup();
    t.permissions.set('usage', false);
    await t.kit.refreshPermissions();

    // Act
    t.failStatus();
    await t.kit.refreshPermissions();

    // Assert
    expect(t.kit.enforcer.current()).toEqual({ mode: 'off', reason: 'permission_revoked' });
    expect(t.blocker.isMonitoring()).toBe(false);
  });
});
