// OWNER: C (task C5). The real ledger: append-only minute events, the 04:00 reset, the daily mint
// cap, 1:1 Cloudy spending, the Sealed rule, and 180 days of local DaySummary rows for Forecast.
// Reaches the clock, posture, usage feed and planner only through get() and the contract.
// Not wired yet: session 5 swaps it into index.ts (USE_REAL stays false until then).
import type {
  AccessWindow,
  DaySummary,
  Debug,
  GetServices,
  Ledger,
  LedgerEvent,
  Posture,
  Scope,
  Seed,
  SpendResult,
  Unsub,
} from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';
import { createDayTracker, type DayTracker } from './dayTracker';
import { HISTORY_DAYS } from './economy';
import { balanceOn, mintedOn, mintFor, parseEvents, prune, resetsDue, summarizeEvents } from './events';
import { readJson, type KV } from './kv';
import { dayKey, lastDays } from './time';

export const EVENTS_KEY = 'events';
export const WINDOWS_KEY = 'windows';
/** The local day this ledger began (YYYY-MM-DD). history() never reports days before it. */
export const SINCE_KEY = 'since';
/** Demo seeds that start with an umbrella (S2/S3: "Cloudy, umbrella 30"). */
export const SEED_BALANCE = 30;
const SEC_PER_MIN = 60;

export type RealLedgerDeps = {
  get: GetServices;
  kv: KV;
  /** Weather the ledger obeys. Default: get().postureSource.get().posture. */
  posture?: () => Posture;
  /** Emergency unlocks on a local day (the governor owns that log). Default: none. */
  unlocksOn?: (date: string) => number[];
  /** The governor's live emergency window (every app, 15 min), added to activeWindows(). Default: none. */
  emergencyWindow?: () => AccessWindow | null;
  /** Subscribe to emergency unlocks; while started, each one fires onChange so enforcement re-plans. */
  onEmergency?: (fn: () => void) => Unsub;
  tracker?: DayTracker;
};

export type RealLedgerDebug = Debug & { setBalance(min: number): void; events(): LedgerEvent[] };

function parseWindows(raw: unknown): AccessWindow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is AccessWindow =>
      typeof w === 'object' && w !== null && typeof w.id === 'string' && Number.isFinite(w.until) && w.scope !== undefined,
  );
}

export function createRealLedger({
  get,
  kv,
  posture,
  unlocksOn = () => [],
  emergencyWindow = () => null,
  onEmergency,
  tracker,
}: RealLedgerDeps) {
  const changes = createEmitter<void>();
  const days = tracker ?? createDayTracker({ get, kv });
  const weather = posture ?? (() => get().postureSource.get().posture);
  const now = () => get().clock.now();
  let events: readonly LedgerEvent[] = parseEvents(readJson(kv, EVENTS_KEY));
  let windows: readonly AccessWindow[] = parseWindows(readJson(kv, WINDOWS_KEY));
  const storedSince = readJson(kv, SINCE_KEY);
  let since: string | null = typeof storedSince === 'string' ? storedSince : null;
  let stopEmergency: Unsub | null = null;

  /** First day of this ledger: the stored start, moved back to the oldest event (ledgers from before it was stored). */
  const firstDay = (today: string): string => {
    const oldestEvent = events.length ? dayKey(events[0].at) : today;
    const first = [since ?? today, oldestEvent].sort()[0];
    if (first !== since) {
      since = first;
      kv.set(SINCE_KEY, JSON.stringify(since));
    }
    return first;
  };

  const save = () => {
    kv.set(EVENTS_KEY, JSON.stringify(events));
    kv.set(WINDOWS_KEY, JSON.stringify(windows));
  };
  /** Close every past day (the 04:00 reset) and drop what's older than 180 days. */
  const settle = (): string => {
    const today = dayKey(now());
    const due = resetsDue(events, today);
    if (due.length) {
      const oldest = lastDays(now(), HISTORY_DAYS)[0];
      events = prune([...events, ...due].sort((a, b) => a.at - b.at), oldest);
      days.prune(oldest);
      save();
    }
    firstDay(today);
    return today;
  };
  const append = (...added: LedgerEvent[]) => {
    events = [...events, ...added];
    windows = windows.filter((w) => w.until > now());
  };
  const openWindow = (id: string, scope: Scope, minutes: number, source: AccessWindow['source']) => {
    const w: AccessWindow = { id, scope, until: now() + minutes * MIN, source };
    windows = [...windows, w];
    return w;
  };
  const uniqueId = (prefix: string) => {
    let id = `${prefix}-${now()}`;
    for (let n = 2; events.some((e) => e.id === id); n++) id = `${prefix}-${now()}-${n}`;
    return id;
  };
  const commit = () => {
    save();
    changes.emit();
  };

  const ledger: Ledger = {
    balance: () => balanceOn(events, settle()),
    spend(minutes, scope): SpendResult {
      const today = settle();
      if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, shortfall: 0 };
      if (weather() === 'sealed') return { ok: false, shortfall: minutes }; // Sealed rule: banked minutes can't open
      const balance = balanceOn(events, today);
      if (balance < minutes) return { ok: false, shortfall: minutes - balance };
      const id = uniqueId('spend');
      append({ id, at: now(), deltaMinutes: -minutes, category: 'spend' });
      const window = openWindow(`w-${id}`, scope, minutes, 'spend');
      commit();
      return { ok: true, window };
    },
    credit({ category, questId, rate }) {
      const today = settle();
      const id = `quest-${questId}`;
      const existing = events.find((e) => e.id === id);
      if (existing) {
        const open = windows.find((w) => w.id === `w-${id}` && w.until > now()) ?? null;
        return { event: existing, window: open }; // same quest twice mints once
      }
      const minted = mintFor(category, rate, mintedOn(events, today));
      const event: LedgerEvent = { id, at: now(), deltaMinutes: minted, category, questId };
      if (weather() !== 'sealed' || minted === 0) {
        append(event);
        commit();
        return { event, window: null };
      }
      // Sealed rule: the quest mints and opens a window of that length at once; banked balance unchanged.
      append(event, { id: `${id}-window`, at: now(), deltaMinutes: -minted, category: 'spend', questId });
      const window = openWindow(`w-${id}`, 'restricted', minted, 'quest');
      commit();
      return { event, window };
    },
    activeWindows: () => {
      const t = now();
      const emergency = emergencyWindow();
      const live = windows.filter((w) => w.until > t);
      return emergency && emergency.until > t ? [...live, emergency] : live;
    },
    history(n) {
      const count = Math.max(0, Math.min(HISTORY_DAYS, Math.floor(Number.isFinite(n) ? n : 0)));
      const first = firstDay(settle());
      return lastDays(now(), count)
        .filter((date) => date >= first)
        .map((date) => summaryOf(date));
    },
    onChange: (fn) => changes.on(() => fn()),
  };

  const summaryOf = (date: string): DaySummary => {
    const inputs = days.inputsFor(date);
    return {
      date,
      restrictedMin: Math.round(inputs.restrictedSec / SEC_PER_MIN),
      pastFreeMin: Math.round(inputs.pastFreeSec / SEC_PER_MIN),
      stormMin: inputs.stormMin,
      ...summarizeEvents(events, date),
      tasksPlanned: inputs.tasksPlanned,
      tasksDone: inputs.tasksDone,
      emergencyUnlocks: unlocksOn(date),
    };
  };

  const debug: RealLedgerDebug = {
    reset() {
      events = [];
      windows = [];
      days.reset();
      kv.remove(EVENTS_KEY);
      kv.remove(WINDOWS_KEY);
      kv.remove(SINCE_KEY);
      since = null;
      changes.emit();
    },
    seed(s: Seed) {
      debug.reset();
      if (s === 'demo_2pm' || s === 'no_plan') debug.setBalance(SEED_BALANCE);
    },
    /** Demo panel: append a `reset` adjustment so the balance (still a sum of events) reads `min`. */
    setBalance(min) {
      const target = Math.max(0, Math.floor(Number.isFinite(min) ? min : 0));
      const delta = target - balanceOn(events, settle());
      if (delta === 0) return;
      append({ id: uniqueId('adjust'), at: now(), deltaMinutes: delta, category: 'reset' });
      commit();
    },
    events: () => [...events],
  };

  const start = () => {
    days.start();
    stopEmergency ??= onEmergency ? onEmergency(() => changes.emit()) : null;
  };
  const stop = () => {
    days.stop();
    stopEmergency?.();
    stopEmergency = null;
  };

  return { services: { ledger }, debug, start, stop };
}
