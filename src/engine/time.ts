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
