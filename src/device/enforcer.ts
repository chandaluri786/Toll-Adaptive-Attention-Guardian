// OWNER: A (Spec A, tasks A3, A4, A5). Turns "what the weather and the ledger say" into "what the
// blocker should do". Split in two so the decision is testable without a phone:
//
//   planEnforcement()  PURE: inputs -> a plan (which apps to block, whether to pause blocking)
//   createEnforcer()   applies a plan to a BlockerPort, only when it changed
//
// Modes:
//   off       nothing is blocked. Fail-open, or the user has no distracting apps yet.
//   metering  Clear skies. Restricted apps are on the blocker's list but blocking is paused by a long
//             "unlock"; the unlock's ticking-down budget is how UsageMeter learns how long restricted
//             apps were used (this feeds the 2-hour free time in C's engine).
//   blocking  Cloudy or Storm with no window open: listed apps show the Storm screen.
//   window    A paid-for / quest-earned / emergency window is open: blocking is paused until it ends.
import type { AccessWindow, PostureSource, Ledger } from '../contracts';
import { computeBlocklist, windowCovers, type AppClassification } from './policy';
import type { FailOpenGuard, FailOpenReason } from './failOpen';
import { hasBlockingPermissions, type BlockerPort, type PermissionStatus } from './ports';

/** Length of the "metering" unlock. Longer than any real day, so it never runs out on its own. */
export const METER_MINUTES = 24 * 60;

export type EnforcementPlan =
  | { mode: 'off'; reason: FailOpenReason | 'no_apps' }
  | { mode: 'metering'; blocklist: string[]; unlockMinutes: number }
  | { mode: 'blocking'; blocklist: string[] }
  | { mode: 'window'; blocklist: string[]; unlockMinutes: number; until: number };

export type PlanInput = {
  posture: 'open' | 'metered' | 'sealed';
  windows: readonly AccessWindow[];
  now: number;
  config: AppClassification;
  installed: readonly string[];
  failOpen: FailOpenReason | null;
};

export function planEnforcement(i: PlanInput): EnforcementPlan {
  if (i.failOpen) return { mode: 'off', reason: i.failOpen };

  if (i.posture === 'open') {
    // Clear skies: nothing is blocked, but we still need to measure restricted-app use.
    const restricted = computeBlocklist('metered', i.config, i.installed);
    return restricted.length === 0
      ? { mode: 'off', reason: 'no_apps' }
      : { mode: 'metering', blocklist: restricted, unlockMinutes: METER_MINUTES };
  }

  const blocklist = computeBlocklist(i.posture, i.config, i.installed);
  if (blocklist.length === 0) return { mode: 'off', reason: 'no_apps' };

  // Any open window lifts blocking (the blocker can only pause everything at once).
  const live = i.windows.filter(
    (w) => windowCovers(w, 'restricted', i.now) || windowCovers(w, 'discretionary', i.now),
  );
  if (live.length > 0) {
    const until = Math.max(...live.map((w) => w.until)); // windows never stack: the longest wins
    return {
      mode: 'window',
      blocklist,
      until,
      unlockMinutes: Math.max(1, Math.ceil((until - i.now) / 60_000)),
    };
  }
  return { mode: 'blocking', blocklist };
}

/** Two plans mean the same thing to the blocker. Minutes are ignored so a ticking window is not re-applied. */
function samePlan(a: EnforcementPlan | null, b: EnforcementPlan): boolean {
  if (!a || a.mode !== b.mode) return false;
  if (a.mode === 'off' || b.mode === 'off') return true;
  if (a.blocklist.join('|') !== b.blocklist.join('|')) return false;
  if (a.mode === 'window' && b.mode === 'window') return a.until === b.until;
  return true;
}

export type EnforcerDeps = {
  blocker: BlockerPort;
  guard: FailOpenGuard;
  posture: Pick<PostureSource, 'get'>;
  ledger: Pick<Ledger, 'activeWindows'>;
  config: () => AppClassification;
  installedPackages: () => string[];
  now: () => number;
  /** Latest permission status, or null when unknown (treated as fine, never as a reason to block). */
  permissions: () => PermissionStatus | null;
  /** Called after a new plan is applied. The runtime uses it to rebase the UsageMeter. */
  onApply?: (plan: EnforcementPlan) => void;
};

export function createEnforcer(d: EnforcerDeps) {
  let applied: EnforcementPlan | null = null;

  const apply = (plan: EnforcementPlan) => {
    switch (plan.mode) {
      case 'off':
        d.blocker.relock();
        d.blocker.setBlockedApps([]);
        d.blocker.stopMonitoring();
        break;
      case 'metering':
        d.blocker.setBlockedApps(plan.blocklist);
        d.blocker.startMonitoring();
        d.blocker.temporaryUnlock(plan.unlockMinutes);
        break;
      case 'blocking':
        d.blocker.setBlockedApps(plan.blocklist);
        d.blocker.startMonitoring();
        d.blocker.relock();
        break;
      case 'window':
        d.blocker.setBlockedApps(plan.blocklist);
        d.blocker.startMonitoring();
        d.blocker.temporaryUnlock(plan.unlockMinutes);
        break;
    }
  };

  return {
    /**
     * Re-evaluate everything and apply it if it changed. Call on every posture / ledger / config
     * change AND on a steady timer (the runtime uses 10 s): the timer is what lets the fail-open
     * guard notice a silent engine and lets an expired window re-block.
     */
    tick(): EnforcementPlan {
      let plan: EnforcementPlan;
      try {
        const state = d.posture.get();
        d.guard.observe(state.computedAt);
        const perms = d.permissions();
        if (perms) d.guard.setPermissions(hasBlockingPermissions(perms));
        const now = d.now();
        plan = planEnforcement({
          posture: state.posture,
          windows: d.ledger.activeWindows(),
          now,
          config: d.config(),
          installed: d.installedPackages(),
          failOpen: d.guard.openReason(),
        });
      } catch {
        d.guard.reportFailure(); // the engine threw: open everything, never lock the user in
        plan = { mode: 'off', reason: 'engine_error' };
      }
      if (!samePlan(applied, plan)) {
        apply(plan);
        applied = plan;
        d.onApply?.(plan);
      }
      return plan;
    },
    /** The plan currently applied (for the UI banner and the gallery). */
    current: () => applied,
  };
}

export type Enforcer = ReturnType<typeof createEnforcer>;
