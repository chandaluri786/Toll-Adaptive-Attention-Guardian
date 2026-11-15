// OWNER: A (Spec A, task A5). Fail-open: if enforcement cannot be trusted, everything opens.
//
// "A blocker that fails closed strands a user behind a crashed service with no recourse. One line of
// defensive code, and the most important line in the project." (planning doc, Safety)
//
// Opens everything when ANY of these holds:
//   1. the engine has gone silent: the PostureState's `computedAt` stamp has not changed for
//      STALE_AFTER_MS (3 min). The engine recomputes every 60 s, so a healthy engine always moves it,
//      even when the weather itself stays the same;
//   2. a permission the blocker needs was revoked (usage access or overlay);
//   3. the engine threw (reported through `reportFailure`).
// It must NEVER open because of: going offline, or the user changing the phone's clock. So
// staleness is measured on a monotonic timer (performance.now(): milliseconds since app start,
// unaffected by clock changes), not by comparing wall-clock timestamps.
//
// Pure and injectable: the guard does nothing native itself. The Enforcer (enforcer.ts) asks it
// `openReason()` and acts.

export const STALE_AFTER_MS = 3 * 60_000;

export type FailOpenReason = 'engine_silent' | 'permission_revoked' | 'engine_error';

export type FailOpenGuard = {
  /**
   * Feed the latest `PostureState.computedAt`. A value different from the last one means the engine
   * is alive. Call it on every check tick, not only when the weather changes.
   */
  observe(computedAt: number): void;
  /** Call from a permission check. `ok` false = a needed permission is missing. */
  setPermissions(ok: boolean): void;
  /** Call when the engine threw. Stays open until the next fresh posture. */
  reportFailure(): void;
  /** Why enforcement is off right now, or null when it is trusted. Safe to call as often as you like. */
  openReason(): FailOpenReason | null;
};

/** `monotonic` returns milliseconds from a clock that only moves forward (default: performance.now). */
export function createFailOpenGuard(monotonic: () => number = () => performance.now()): FailOpenGuard {
  let lastComputedAt: number | null = null;
  let lastFresh = monotonic();
  let permissionsOk = true;
  let failed = false;

  return {
    observe(computedAt) {
      if (computedAt === lastComputedAt) return; // same stamp: no news
      lastComputedAt = computedAt;
      lastFresh = monotonic();
      failed = false; // a new result means the engine recovered
    },
    setPermissions(ok) {
      permissionsOk = ok;
    },
    reportFailure() {
      failed = true;
    },
    openReason() {
      if (failed) return 'engine_error';
      if (!permissionsOk) return 'permission_revoked';
      if (monotonic() - lastFresh > STALE_AFTER_MS) return 'engine_silent';
      return null;
    },
  };
}

/** Plain-words banner copy for each reason (shown when everything has opened). */
export const FAIL_OPEN_COPY: Record<FailOpenReason, string> = {
  engine_silent: "Toll lost track of the weather, so every app is open for now.",
  permission_revoked: 'A permission Toll needs was turned off, so every app is open until it is back.',
  engine_error: 'Something went wrong on our side, so every app is open for now.',
};
