// OWNER: A (Spec A, task A2). The real UsageFeed.
//
// The plan assumed we could poll "which app is in the foreground" every second. expo-app-blocker
// does not expose that: it only blocks apps on a list. What it does expose is an unlock budget that
// ticks down while a BLOCKED app is in use (see enforcer.ts, "metering" mode). That is exactly the
// signal C's engine needs ("minutes spent in restricted apps"), so this meter converts:
//
//   - budget going down by N seconds   -> N one-second samples for a restricted app
//   - the blocker's queued intercepts   -> onIntercept events (each is one "urge": an open that
//                                          ran into the Storm / Cloudy screen)
//
// Limits, stated plainly: samples say "a restricted app was in use" but not WHICH one (the blocker
// does not tell us), and Discretionary apps are not measured. The engine only needs the former.
// If we ever need the package name every second, that needs a small custom native module.
import type { ForegroundSample, Unsub, UsageFeed } from '../contracts';
import { createEmitter } from '../shared/emitter';
import type { BlockerPort } from './ports';

/** Cap per poll so a long gap (phone asleep) cannot flood the engine with samples. */
const MAX_SAMPLES_PER_POLL = 60;

export const RESTRICTED_SAMPLE_PKG = 'restricted-app';

export function createUsageMeter(blocker: Pick<BlockerPort, 'remainingUnlockSeconds' | 'drainIntercepts'>, now: () => number) {
  const samples = createEmitter<ForegroundSample>();
  const intercepts = createEmitter<ForegroundSample>();
  let lastRemaining: number | null = null;

  const feed: UsageFeed = {
    onSample: (fn: (s: ForegroundSample) => void): Unsub => samples.on(fn),
    onIntercept: (fn: (s: ForegroundSample) => void): Unsub => intercepts.on(fn),
  };

  return {
    feed,
    /**
     * Forget the last reading. The Enforcer calls this whenever it replaces the blocker's unlock
     * (e.g. a 24 h meter becomes a 15 min window): the remaining time then jumps DOWN without any
     * app having been used, and must not be counted as usage.
     */
    rebase(): void {
      lastRemaining = null;
    },
    /** Call about once a second while the app runs (the runtime does this). */
    poll(): void {
      const remaining = blocker.remainingUnlockSeconds();
      if (lastRemaining !== null && remaining < lastRemaining) {
        const used = Math.min(MAX_SAMPLES_PER_POLL, Math.round(lastRemaining - remaining));
        const t = now();
        // one sample per second of use, oldest first, so a 5-second poll still reads as 5 seconds
        for (let i = used - 1; i >= 0; i--) {
          samples.emit({ at: t - i * 1000, pkg: RESTRICTED_SAMPLE_PKG, appClass: 'restricted' });
        }
      }
      // Also covers a NEW unlock (larger value): move the baseline, nothing was used.
      lastRemaining = remaining;

      for (const hit of blocker.drainIntercepts()) {
        intercepts.emit({ at: hit.interceptedAt, pkg: hit.appName ?? 'unknown', appClass: 'restricted' });
      }
    },
  };
}

export type UsageMeter = ReturnType<typeof createUsageMeter>;
