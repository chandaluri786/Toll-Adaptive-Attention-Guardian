// OWNER: B. Local-time helpers. Every function takes `now` explicitly: callers read it from
// Clock.now() so the demo panel can move time (never Date.now()).

export const MINUTES_PER_DAY = 24 * 60;
/** Every day starts fresh at 04:00 (planning doc: "Caps and decay"). */
export const DAY_START_MIN = 4 * 60;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHMM(s: string): boolean {
  return HHMM.test(s);
}

/** "07:30" → 450. Throws on malformed input; validate with isHHMM first for user input. */
export function parseHHMM(s: string): number {
  const m = HHMM.exec(s);
  if (!m) throw new Error(`Not a HH:MM time: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHHMM(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** Timestamp for `minutes` past local midnight on the calendar day of `now`, shifted by `dayOffset` days. */
export function localAt(now: number, minutes: number, dayOffset = 0): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setMinutes(minutes);
  return d.getTime();
}

/** The planning day `now` belongs to, as YYYY-MM-DD. The day rolls over at 04:00, not midnight. */
export function dayKey(now: number): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - DAY_START_MIN);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Length of a window that may cross midnight, e.g. 23:00–07:00 = 480. */
export function windowMinutes(startMin: number, endMin: number): number {
  return (endMin - startMin + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
