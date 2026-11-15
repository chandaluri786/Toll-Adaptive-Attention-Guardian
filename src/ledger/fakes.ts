// OWNER: C (Spec C — Engine, money, cloud). See docs/specs/C-engine-cloud.md.
// In-memory Ledger fake. It already applies the Storm (Sealed) rule so A and B see the right
// behaviour from day one; it has no caps, no reset and no sync (those are task C5 / C9).
import type {
  AccessWindow,
  DaySummary,
  Debug,
  GetServices,
  Ledger,
  LedgerEvent,
  Scope,
  Seed,
  SpendResult,
  TaskType,
} from '../contracts';
import { createEmitter, MIN } from '../shared/emitter';

/** Minutes minted per verified quest — "Earning" table in the planning doc. */
export const EARNING: Record<TaskType, number> = {
  fitness: 25,
  place: 25,
  meetup: 25,
  study: 20,
  coding: 20,
  focus: 15,
};

const START_BALANCE = 30; // fake only; the real ledger starts each day at 0

export function createFakeLedger(get: GetServices) {
  const changes = createEmitter<void>();
  let events: LedgerEvent[] = [];
  let windows: AccessWindow[] = [];
  let balance = START_BALANCE;
  let seq = 0;

  const now = () => get().clock.now();
  const posture = () => get().postureSource.get().posture;
  const push = (e: Omit<LedgerEvent, 'id' | 'at'>) => {
    const event = { id: `ev-${++seq}`, at: now(), ...e };
    events = [...events, event];
    return event;
  };
  const openWindow = (scope: Scope, minutes: number, source: AccessWindow['source']) => {
    const w: AccessWindow = { id: `w-${++seq}`, scope, until: now() + minutes * MIN, source };
    windows = [...windows, w];
    return w;
  };

  const ledger: Ledger = {
    balance: () => balance,
    spend(minutes, scope): SpendResult {
      if (posture() === 'sealed') return { ok: false, shortfall: minutes }; // refused in Storm
      if (balance < minutes) return { ok: false, shortfall: minutes - balance };
      balance -= minutes;
      push({ deltaMinutes: -minutes, category: 'spend' });
      const window = openWindow(scope, minutes, 'spend');
      changes.emit();
      return { ok: true, window };
    },
    credit({ category, questId, rate }) {
      const minted = Math.round(EARNING[category] * rate);
      const event = push({ deltaMinutes: minted, category, questId });
      let window: AccessWindow | null = null;
      if (posture() === 'sealed') {
        // Storm: the quest opens a window straight away instead of banking minutes.
        window = openWindow('restricted', minted, 'quest');
      } else {
        balance += minted;
      }
      changes.emit();
      return { event, window };
    },
    activeWindows: () => windows.filter((w) => w.until > now()),
    history: (days) => generateHistory(days, now()),
    onChange: (fn) => changes.on(() => fn()),
  };

  const debug: Debug & { setBalance(min: number): void; events(): LedgerEvent[] } = {
    reset() {
      events = [];
      windows = [];
      balance = START_BALANCE;
      changes.emit();
    },
    seed(s: Seed) {
      debug.reset();
      if (s === 'late_night') balance = 0;
      changes.emit();
    },
    setBalance(min) {
      balance = Math.max(0, min);
      changes.emit();
    },
    events: () => events,
  };

  return { services: { ledger }, debug };
}

/** Local `YYYY-MM-DD` (never UTC): a day means local time, so `toISOString()` would shift it. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Deterministic fake history (same every run) so Forecast screens and tests are stable. */
export function generateHistory(days: number, now: number): DaySummary[] {
  let s = 42;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: DaySummary[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * MIN);
    d.setHours(12, 0, 0, 0); // pin to noon so repeated calls return identical data
    const planned = rand() < 0.25 ? null : 3 + Math.floor(rand() * 4);
    const trend = 1 - (days - i) / (days * 2); // slowly improving
    const restricted = Math.round((90 + rand() * 120) * trend);
    out.push({
      date: localDate(d),
      restrictedMin: restricted,
      pastFreeMin: Math.max(0, restricted - 120),
      stormMin: Math.round(rand() * 90),
      questOpenedMin: Math.round(rand() * 40),
      earned: Math.round(rand() * 90),
      spent: Math.round(rand() * 70),
      tasksPlanned: planned,
      tasksDone: planned === null ? Math.floor(rand() * 3) : Math.floor(rand() * (planned + 1)),
      questsByCategory: { fitness: Math.floor(rand() * 2), focus: Math.floor(rand() * 3) },
      emergencyUnlocks: rand() < 0.08 ? [d.getTime()] : [],
    });
  }
  return out;
}
