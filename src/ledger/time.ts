// OWNER: C. Local-day helpers for the ledger. "Day" means local time with the reset at 04:00 —
// never UTC, never toISOString(). Same idea as src/engine/time.ts, copied (no cross-folder import).

/** Every day starts fresh at 04:00 local. */
export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local day `now` belongs to, as YYYY-MM-DD. 03:59 still belongs to yesterday. */
export function dayKey(now: number): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - DAY_START_HOUR * 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local noon on `date` shifted by `offsetDays` (DST-safe: built from the calendar), or null if malformed. */
function noonOf(date: string, offsetDays = 0): Date | null {
  const m = DATE.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + offsetDays, 12, 0, 0, 0);
}

/** 04:00 local on `date` — the instant that day starts. NaN for a malformed date. */
export function dayStart(date: string): number {
  const d = noonOf(date);
  if (!d) return NaN;
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime();
}

/** The last instant that still belongs to `date` (03:59:59.999 the next morning). */
export function dayEnd(date: string): number {
  const d = noonOf(date, 1);
  if (!d) return NaN;
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d.getTime() - 1;
}

/** The `n` local days ending with the day `now` belongs to, oldest first. */
export function lastDays(now: number, n: number): string[] {
  const today = dayKey(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = noonOf(today, -i);
    if (d) out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}
