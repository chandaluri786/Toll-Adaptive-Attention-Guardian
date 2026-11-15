// OWNER: C (task C4). The emergency unlock: 15 minutes of every app, once per local day,
// back at 04:00 local. No quest, no cost, never depends on tasks, balance or history.
// Each use is logged (timestamps under `engine:`) so the ledger's history() can report
// DaySummary.emergencyUnlocks for Forecast.
import type { AccessWindow, Clock, Governor, Unsub } from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';
import { readJson, type KV } from './kv';
import { dayKey } from './time';

export const EMERGENCY_MS = 15 * MIN;
export const EMERGENCY_KEY = 'governor:emergency';
/** Forecast keeps 180 days of summaries; older log entries are pruned on write. */
export const LOG_KEEP_MS = 180 * 24 * 60 * MIN;

export type GovernorDeps = { clock: Clock; kv: KV };

export type RealGovernor = Governor & {
  /** Every logged use, oldest first (a copy). */
  log(): readonly number[];
  /** Uses that fall on the local day `date` (YYYY-MM-DD, day starts 04:00). */
  unlocksOn(date: string): number[];
  /** The emergency window still open now, or null. The ledger adds it to activeWindows() so enforcement sees it. */
  activeWindow(): AccessWindow | null;
  /** Fires with the new window each time an unlock opens (not for a refused one). */
  onUse(fn: (w: AccessWindow) => void): Unsub;
  /** Debug: forget every use. */
  reset(): void;
};

/** Never trust storage: anything that isn't a list of finite timestamps counts as empty. */
function parseLog(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).sort((a, b) => a - b);
}

const windowFrom = (at: number): AccessWindow => ({ id: `em-${at}`, scope: 'all', until: at + EMERGENCY_MS, source: 'emergency' });

export function createGovernor({ clock, kv }: GovernorDeps): RealGovernor {
  let entries: readonly number[] = parseLog(readJson(kv, EMERGENCY_KEY));
  const uses = createEmitter<AccessWindow>();

  const usedToday = () => {
    const today = dayKey(clock.now());
    return entries.some((t) => dayKey(t) === today);
  };

  const record = (at: number) => {
    entries = [...entries.filter((t) => t >= at - LOG_KEEP_MS), at];
    kv.set(EMERGENCY_KEY, JSON.stringify(entries));
  };

  return {
    emergencyUnlock(): AccessWindow | null {
      if (usedToday()) return null;
      const at = clock.now();
      record(at);
      const w = windowFrom(at);
      uses.emit(w);
      return w;
    },
    emergencyLeftToday: () => (usedToday() ? 0 : 1),
    log: () => [...entries],
    unlocksOn: (date) => entries.filter((t) => dayKey(t) === date),
    activeWindow() {
      const last = entries.at(-1);
      if (last === undefined) return null;
      const w = windowFrom(last);
      return w.until > clock.now() ? w : null;
    },
    onUse: (fn) => uses.on(fn),
    reset() {
      entries = [];
      kv.remove(EMERGENCY_KEY);
    },
  };
}
