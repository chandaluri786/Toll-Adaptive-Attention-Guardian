// OWNER: C (task C5). Pure rules over the append-only event list. The balance is the sum of the
// current local day's events; at 04:00 every earlier day is closed by a `reset` event dated to
// that day's last instant, so every past day sums to 0 and the server's sum of synced deltas
// matches the phone (only id, at, deltaMinutes ever sync).
import type { LedgerEvent, TaskType } from '../contracts';
import { DAILY_MINT_CAP, EARNING, repeatPercent } from './economy';
import { dayEnd, dayKey } from './time';

const CATEGORIES = new Set<string>([...Object.keys(EARNING), 'spend', 'emergency', 'reset']);

export const isQuestCategory = (c: string): c is TaskType => c in EARNING;

/** Never trust storage: keep only well-formed events, oldest first, first copy of each id. */
export function parseEvents(raw: unknown): LedgerEvent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LedgerEvent[] = [];
  for (const e of raw) {
    if (!isEvent(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, b) => a.at - b.at);
}

function isEvent(e: unknown): e is LedgerEvent {
  if (typeof e !== 'object' || e === null) return false;
  const v = e as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.at === 'number' &&
    Number.isFinite(v.at) &&
    typeof v.deltaMinutes === 'number' &&
    Number.isFinite(v.deltaMinutes) &&
    typeof v.category === 'string' &&
    CATEGORIES.has(v.category) &&
    (v.questId === undefined || typeof v.questId === 'string')
  );
}

export const eventsOn = (events: readonly LedgerEvent[], date: string) =>
  events.filter((e) => dayKey(e.at) === date);

const sum = (events: readonly LedgerEvent[]) => events.reduce((n, e) => n + e.deltaMinutes, 0);

/** Umbrella time on `date`: the sum of that day's events. */
export const balanceOn = (events: readonly LedgerEvent[], date: string) => sum(eventsOn(events, date));

/** Minutes minted by quests on `date` (counts toward the cap; Storm mints included). */
export const mintedOn = (events: readonly LedgerEvent[], date: string) =>
  sum(eventsOn(events, date).filter((e) => isQuestCategory(e.category)));

/** How many quests of `category` were logged on `date` (capped and zero mints count: they happened). */
export const questsOn = (events: readonly LedgerEvent[], date: string, category: TaskType) =>
  eventsOn(events, date).filter((e) => e.category === category).length;

/**
 * Minutes a verified quest mints: earning table × rate × the repeat percent (100/60/30/0 for the
 * day's 1st/2nd/3rd/4th+ of that category), rounded half-up, never past the day's cap.
 */
export function mintFor(category: TaskType, rate: number, mintedToday: number, repeats = 0): number {
  const base = EARNING[category] ?? 0;
  const r = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
  const raw = Math.round(((base * r * repeatPercent(repeats)) / 100) * 1e6) / 1e6; // float noise before half-up
  return Math.max(0, Math.min(Math.round(raw), DAILY_MINT_CAP - mintedToday));
}

/**
 * The 04:00 reset. Every day other than `today` whose events don't sum to 0 gets a `reset`
 * event at its last instant. Returns the new events to append (empty when nothing to close).
 * Moving the clock backwards closes the later day the same way, so the rule holds both ways.
 */
export function resetsDue(events: readonly LedgerEvent[], today: string): LedgerEvent[] {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const d = dayKey(e.at);
    byDay.set(d, (byDay.get(d) ?? 0) + e.deltaMinutes);
  }
  const ids = new Set(events.map((e) => e.id));
  const out: LedgerEvent[] = [];
  for (const [date, total] of byDay) {
    if (date === today || total === 0) continue;
    let id = `reset-${date}`;
    for (let n = 2; ids.has(id); n++) id = `reset-${date}-${n}`;
    ids.add(id);
    out.push({ id, at: dayEnd(date), deltaMinutes: -total, category: 'reset' });
  }
  return out;
}

/** The ledger's half of a DaySummary, built from that day's real events. */
export function summarizeEvents(events: readonly LedgerEvent[], date: string) {
  const day = eventsOn(events, date);
  const questsByCategory: Partial<Record<TaskType, number>> = {};
  let earned = 0;
  let spent = 0;
  let questOpenedMin = 0;
  for (const e of day) {
    if (isQuestCategory(e.category)) {
      earned += e.deltaMinutes;
      questsByCategory[e.category] = (questsByCategory[e.category] ?? 0) + 1;
    } else if (e.category === 'spend' && e.questId !== undefined) {
      questOpenedMin += -e.deltaMinutes; // a Storm quest's window
    } else if (e.category === 'spend') {
      spent += -e.deltaMinutes;
    }
  }
  return { earned, spent, questOpenedMin, questsByCategory };
}

/** Keep only days from `oldestKept` on (each closed day sums to 0, so the balance is unchanged). */
export function prune(events: readonly LedgerEvent[], oldestKept: string): LedgerEvent[] {
  return events.filter((e) => dayKey(e.at) >= oldestKept);
}
