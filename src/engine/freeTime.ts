// OWNER: C (task C2). Free time: each day starts at 04:00 local with 120 minutes, counted down by
// Restricted-app use outside a storm. While any is left, behaviour signals are off (see scoring.ts).
// Stored at `engine:freeTime` as { day, usedMs } so a restart keeps today's count.
import type { Clock } from '../contracts';
import { MIN } from '../shared/emitter';
import { readJson, type KV } from './kv';
import { dayKey } from './time';

export const FREE_TIME_MIN = 120;
export const FREE_TIME_KEY = 'freeTime';
const FREE_TIME_MS = FREE_TIME_MIN * MIN;

type Stored = { day: string; usedMs: number };

export type FreeTime = {
  /** Whole minutes left today, rounded up, so behaviour switches on only when it is really 0. */
  leftMin(): number;
  /** Count `ms` of Restricted use against today. */
  use(ms: number): void;
  /** Demo panel: force the minutes left today (0..120). */
  setLeft(min: number): void;
  /** Give the whole 120 back. */
  reset(): void;
};

/** Never trust storage: anything malformed counts as an unused day (fails open). */
function parse(raw: unknown): Stored | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { day, usedMs } = raw as Record<string, unknown>;
  if (typeof day !== 'string' || typeof usedMs !== 'number' || !Number.isFinite(usedMs)) return null;
  return { day, usedMs: Math.min(Math.max(usedMs, 0), FREE_TIME_MS) };
}

export function createFreeTime({ clock, kv }: { clock: Clock; kv: KV }): FreeTime {
  let state: Stored | null = parse(readJson(kv, FREE_TIME_KEY));

  /** Today's state, rolled over at 04:00. */
  const today = (): Stored => {
    const day = dayKey(clock.now());
    return state && state.day === day ? state : { day, usedMs: 0 };
  };

  const save = (next: Stored) => {
    const prev = state;
    state = next;
    // Persist on day change and whole-minute steps only: samples arrive every second.
    const sameMinute = prev && prev.day === next.day && Math.floor(prev.usedMs / MIN) === Math.floor(next.usedMs / MIN);
    if (!sameMinute) kv.set(FREE_TIME_KEY, JSON.stringify(next));
  };

  const setUsed = (usedMs: number) => {
    const t = today();
    save({ day: t.day, usedMs: Math.min(Math.max(usedMs, 0), FREE_TIME_MS) });
  };

  return {
    leftMin: () => Math.ceil((FREE_TIME_MS - today().usedMs) / MIN),
    use(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      setUsed(today().usedMs + ms);
    },
    setLeft(min) {
      const left = Number.isFinite(min) ? Math.min(Math.max(min, 0), FREE_TIME_MIN) : FREE_TIME_MIN;
      const next = { day: today().day, usedMs: FREE_TIME_MS - left * MIN };
      state = next;
      kv.set(FREE_TIME_KEY, JSON.stringify(next));
    },
    reset() {
      state = { day: today().day, usedMs: 0 };
      kv.remove(FREE_TIME_KEY);
    },
  };
}
