// OWNER: C (task C5). Local-day helpers: 04:00 reset, local dates, never UTC.
import { dayEnd, dayKey, dayStart, lastDays } from '../time';

const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m, d, h, min).getTime();

describe('ledger time', () => {
  it('03:59 belongs to yesterday, 04:00 to today', () => {
    expect(dayKey(at(10, 16, 3, 59))).toBe('2026-11-15');
    expect(dayKey(at(10, 16, 4))).toBe('2026-11-16');
  });

  it('late evening stays on the local date (no UTC shift)', () => {
    expect(dayKey(at(10, 15, 23, 30))).toBe('2026-11-15');
  });

  it('dayStart is 04:00 local and dayEnd the instant before the next 04:00', () => {
    expect(dayStart('2026-11-15')).toBe(at(10, 15, 4));
    expect(dayEnd('2026-11-15')).toBe(at(10, 16, 4) - 1);
    expect(dayKey(dayEnd('2026-11-15'))).toBe('2026-11-15');
  });

  it('malformed dates give NaN', () => {
    expect(dayStart('15/11/2026')).toBeNaN();
    expect(dayEnd('')).toBeNaN();
  });

  it('lastDays crosses month and year ends', () => {
    expect(lastDays(at(0, 1, 12), 3)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01']);
    expect(lastDays(at(2, 1, 12), 2)).toEqual(['2026-02-28', '2026-03-01']);
  });
});
