// OWNER: C. Local-day helpers. "Day" means local time with the reset at 04:00 — never UTC,
// never toISOString(). Same idea as src/day/time.ts, copied so C never imports src/day.

/** Every day starts fresh at 04:00 local. */
export const DAY_START_MIN = 4 * 60;

/** The local day `now` belongs to, as YYYY-MM-DD. 03:59 still belongs to yesterday. */
export function dayKey(now: number): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - DAY_START_MIN);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const MINUTES_PER_DAY = 24 * 60;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "07:30" → 450, or null when malformed (never trust a feed). */
export function parseHm(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = HHMM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes past local midnight. */
export function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** Length of a window that may cross midnight, e.g. 23:00–07:00 = 480. */
export function windowMinutes(startMin: number, endMin: number): number {
  return (((endMin - startMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Whether minute-of-day `m` falls in [start, end), crossing midnight if needed. */
export function inWindow(m: number, startMin: number, endMin: number): boolean {
  return windowMinutes(startMin, m) < windowMinutes(startMin, endMin);
}

/** The next local timestamp at `minOfDay` strictly after `now` (DST-safe: built from the calendar). */
export function nextLocalAt(now: number, minOfDay: number): number {
  const d = new Date(now);
  d.setHours(Math.floor(minOfDay / 60), minOfDay % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Local "HH:MM" for a timestamp, as reasons show it ("Storm until 11:00"). */
export function formatHm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
