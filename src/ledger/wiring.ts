// OWNER: C (session 5). Wires the real ledger (./real.ts) to the other folders through get() only:
// it obeys the *enforced* weather (during the 90-s advisory the old weather still rules), reads
// emergency unlocks from C's governor for history() and its live window for activeWindows(), and starts its day tracker (usage samples,
// Storm minutes, plan progress) on first use, once services are wired.
import type { AccessWindow, GetServices, Governor, Ledger, Posture, PostureState, Unsub } from '../contracts';
import type { KV } from './kv';
import { createRealLedger, type RealLedgerDeps } from './real';

/**
 * The weather the ledger obeys. Grace only ever comes with a tightening, so "Storm shown with grace"
 * means Storm isn't enforced yet; the ledger only cares whether it is Storm.
 */
export function obeyedPosture(s: PostureState): Posture {
  return s.posture === 'sealed' && s.grace ? 'metered' : s.posture;
}

/** C's real governor also logs each use (`unlocksOn`); the contract's Governor doesn't, so read it if present. */
export function unlocksVia(governor: Governor | undefined, date: string): number[] {
  const g = governor as (Governor & { unlocksOn?: (d: string) => number[] }) | undefined;
  return typeof g?.unlocksOn === 'function' ? g.unlocksOn(date) : [];
}

/** C's real governor also exposes its live window and a use event; the fake doesn't, so both are optional. */
type GovernorExtras = Governor & {
  activeWindow?: () => AccessWindow | null;
  onUse?: (fn: (w: AccessWindow) => void) => Unsub;
};

/** The emergency window still open, if the governor can say. */
export function emergencyWindowVia(governor: Governor | undefined): AccessWindow | null {
  const g = governor as GovernorExtras | undefined;
  return typeof g?.activeWindow === 'function' ? g.activeWindow() : null;
}

/** Subscribe to emergency unlocks, if the governor offers it (else a no-op). */
export function onEmergencyVia(governor: Governor | undefined, fn: () => void): Unsub {
  const g = governor as GovernorExtras | undefined;
  return typeof g?.onUse === 'function' ? g.onUse(() => fn()) : () => {};
}

export function wireLedger(get: GetServices, kv: KV, overrides: Partial<RealLedgerDeps> = {}) {
  const real = createRealLedger({
    get,
    kv,
    posture: () => obeyedPosture(get().postureSource.get()),
    unlocksOn: (date) => unlocksVia(get().governor, date),
    emergencyWindow: () => emergencyWindowVia(get().governor),
    onEmergency: (fn) => onEmergencyVia(get().governor, fn),
    ...overrides,
  });
  let started = false;
  /** The day tracker subscribes to the clock, usage feed and planner, so wait until they exist. */
  const use = (): Ledger => {
    const s = get();
    if (!started && s.clock && s.usageFeed && s.planner && s.postureSource && s.governor) {
      started = true;
      real.start();
    }
    return real.services.ledger;
  };

  const ledger: Ledger = {
    balance: () => use().balance(),
    spend: (minutes, scope) => use().spend(minutes, scope),
    credit: (c) => use().credit(c),
    activeWindows: () => use().activeWindows(),
    history: (days) => use().history(days),
    onChange: (fn) => use().onChange(fn),
  };

  return { services: { ledger }, debug: real.debug, stop: () => real.stop() };
}
