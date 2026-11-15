// OWNER: A (tasks A3, A5). What the blocker is told to do for each weather, window and failure.
import type { AccessWindow, Posture, PostureState } from '../../contracts';
import { MIN } from '../../shared/emitter';
import { createFakeBlocker } from '../fakePorts';
import { METER_MINUTES, createEnforcer, planEnforcement, type PlanInput } from '../enforcer';
import { createFailOpenGuard } from '../failOpen';
import type { AppClassification } from '../policy';
import type { PermissionStatus } from '../ports';

const NOW = 5_000_000;
const config: AppClassification = { restricted: new Set(['ig']), alwaysOpen: new Set(), discretionary: new Set(['chrome']) };
const base: PlanInput = { posture: 'open', windows: [], now: NOW, config, installed: ['ig', 'chrome', 'maps'], failOpen: null };
const win = (until: number, scope: AccessWindow['scope'] = 'restricted'): AccessWindow => ({ id: 'w', scope, until, source: 'quest' });

describe('planEnforcement', () => {
  it('Clear skies: meter restricted apps, block nothing', () => {
    expect(planEnforcement(base)).toEqual({ mode: 'metering', blocklist: ['ig'], unlockMinutes: METER_MINUTES });
  });
  it('Cloudy: block restricted apps', () => {
    expect(planEnforcement({ ...base, posture: 'metered' })).toEqual({ mode: 'blocking', blocklist: ['ig'] });
  });
  it('Storm: block restricted and discretionary apps', () => {
    expect(planEnforcement({ ...base, posture: 'sealed' })).toEqual({ mode: 'blocking', blocklist: ['ig', 'chrome'] });
  });
  it('an open window pauses blocking until it ends, rounded up to whole minutes', () => {
    const plan = planEnforcement({ ...base, posture: 'sealed', windows: [win(NOW + 14 * MIN + 1)] });
    expect(plan).toEqual({ mode: 'window', blocklist: ['ig', 'chrome'], until: NOW + 14 * MIN + 1, unlockMinutes: 15 });
  });
  it('windows never stack: the longest one wins', () => {
    const plan = planEnforcement({ ...base, posture: 'metered', windows: [win(NOW + 5 * MIN), win(NOW + 20 * MIN, 'all')] });
    expect(plan).toMatchObject({ mode: 'window', until: NOW + 20 * MIN });
  });
  it('an expired window is ignored', () => {
    expect(planEnforcement({ ...base, posture: 'metered', windows: [win(NOW - 1)] }).mode).toBe('blocking');
  });
  it('with no distracting apps there is nothing to do', () => {
    expect(planEnforcement({ ...base, installed: ['maps'], posture: 'metered' })).toEqual({ mode: 'off', reason: 'no_apps' });
  });
  it('fail-open beats everything, even a Storm', () => {
    expect(planEnforcement({ ...base, posture: 'sealed', failOpen: 'engine_silent' })).toEqual({ mode: 'off', reason: 'engine_silent' });
  });
});

/** A full Enforcer wired to fakes, with a controllable weather. */
function setup(initial: Posture = 'open', perms: PermissionStatus | null = null) {
  const blocker = createFakeBlocker();
  let mono = 0;
  const guard = createFailOpenGuard(() => mono);
  let now = NOW;
  let computedAt = 1;
  let state: PostureState = { posture: initial, score: 0, reason: '', reasonCode: 'none', nextChange: null, grace: false, allowanceLeftMin: 120, computedAt };
  let windows: AccessWindow[] = [];
  let permissions = perms;
  const applied: string[] = [];
  const enforcer = createEnforcer({
    blocker,
    guard,
    posture: { get: () => state },
    ledger: { activeWindows: () => windows },
    config: () => config,
    installedPackages: () => ['ig', 'chrome', 'maps'],
    now: () => now,
    permissions: () => permissions,
    onApply: (p) => applied.push(p.mode),
  });
  return {
    blocker,
    enforcer,
    applied,
    setPosture: (p: Posture) => (state = { ...state, posture: p, computedAt: ++computedAt }),
    heartbeat: () => (state = { ...state, computedAt: ++computedAt }),
    setWindows: (w: AccessWindow[]) => (windows = w),
    setNow: (t: number) => (now = t),
    advanceMono: (ms: number) => (mono += ms),
    setPermissions: (p: PermissionStatus | null) => (permissions = p),
  };
}

const granted: PermissionStatus = { usage: true, overlay: true, notifications: true, location: true, camera: true, motion: true };

describe('createEnforcer', () => {
  it('Clear skies -> Cloudy: re-arms the blocker once, not on every tick', () => {
    const t = setup('open');
    t.enforcer.tick();
    expect(t.blocker.calls).toEqual(['setBlockedApps(1)', 'startMonitoring', 'temporaryUnlock(1440)']);

    t.blocker.clearCalls();
    t.enforcer.tick();
    t.enforcer.tick();
    expect(t.blocker.calls).toEqual([]); // nothing changed, nothing re-sent

    t.setPosture('metered');
    t.enforcer.tick();
    expect(t.blocker.calls).toEqual(['setBlockedApps(1)', 'startMonitoring', 'relock']);
    expect(t.applied).toEqual(['metering', 'blocking']);
  });

  it('a quest window lifts the Storm, then blocking resumes when the window ends', () => {
    const t = setup('sealed');
    t.enforcer.tick();
    t.blocker.clearCalls();

    t.setWindows([win(NOW + 25 * MIN)]);
    t.enforcer.tick();
    expect(t.blocker.calls).toContain('temporaryUnlock(25)');

    t.blocker.clearCalls();
    t.setNow(NOW + 26 * MIN); // the window is over
    t.setWindows([]);
    t.heartbeat();
    t.enforcer.tick();
    expect(t.blocker.calls).toContain('relock');
    expect(t.enforcer.current()?.mode).toBe('blocking');
  });

  it('a silent engine opens everything after 3 minutes, and the Storm returns when it recovers', () => {
    const t = setup('sealed');
    t.enforcer.tick();
    expect(t.enforcer.current()?.mode).toBe('blocking');

    t.advanceMono(3 * MIN + 1); // no heartbeat
    t.enforcer.tick();
    expect(t.enforcer.current()).toEqual({ mode: 'off', reason: 'engine_silent' });
    expect(t.blocker.blockedApps()).toEqual([]);
    expect(t.blocker.isMonitoring()).toBe(false);

    t.heartbeat();
    t.enforcer.tick();
    expect(t.enforcer.current()?.mode).toBe('blocking');
  });

  it('a revoked permission opens everything; unknown permissions never do', () => {
    const t = setup('sealed', null); // status unknown yet
    t.enforcer.tick();
    expect(t.enforcer.current()?.mode).toBe('blocking');

    t.setPermissions({ ...granted, overlay: false });
    t.enforcer.tick();
    expect(t.enforcer.current()).toEqual({ mode: 'off', reason: 'permission_revoked' });

    t.setPermissions(granted);
    t.enforcer.tick();
    expect(t.enforcer.current()?.mode).toBe('blocking');
  });

  it('if the engine throws, everything opens instead of locking the user in', () => {
    const blocker = createFakeBlocker();
    const enforcer = createEnforcer({
      blocker,
      guard: createFailOpenGuard(() => 0),
      posture: { get: () => { throw new Error('engine exploded'); } },
      ledger: { activeWindows: () => [] },
      config: () => config,
      installedPackages: () => ['ig'],
      now: () => NOW,
      permissions: () => null,
    });
    expect(enforcer.tick()).toEqual({ mode: 'off', reason: 'engine_error' });
    expect(blocker.blockedApps()).toEqual([]);
  });
});
