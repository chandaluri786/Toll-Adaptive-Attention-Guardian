// OWNER: C (task C2). The worked-day rows from the planning doc ("Scoring → A worked day") as tests.
// Waking day 07:00–23:00, 5 tasks, free time runs out at 13:00.
import type { Signals } from '../../contracts';
import { bandOf, deficitPoints, MAX_OUTSIDE_BLOCK, score, urgePoints, velocityPoints, WIN_POINTS } from '../scoring';

/** Signals with everything off; free time used up unless a row says otherwise. */
const sig = (patch: Partial<Signals> = {}): Signals => ({
  baseScore: 0,
  deficit: 0,
  scrollMinutes60: 0,
  urgeCount15: 0,
  minutesSinceWin: null,
  allowanceLeftMin: 0,
  ...patch,
});

/** Elapsed share of the 07:00–23:00 waking day at h:m, minus the done share. */
const deficitAt = (h: number, m: number, done: number, total = 5) =>
  Math.max(0, (h * 60 + m - 7 * 60) / (16 * 60) - done / total);

describe('deficitPoints', () => {
  it('rounds halves up (15:00, 2 of 5 done: deficit 0.10 → +3)', () => {
    expect(deficitPoints(0.1)).toBe(3);
    expect(deficitPoints(0.02)).toBe(1); // 0.5 → 1
  });
  it('is 0 with no deficit', () => {
    expect(deficitPoints(0)).toBe(0);
  });
});

describe('score() — worked day (task C2)', () => {
  it('09:00 free, 0 of 5 done, free time left → 0, Open', () => {
    const s = score(sig({ deficit: deficitAt(9, 0, 0), allowanceLeftMin: 120 }));
    expect(s).toBe(0);
    expect(bandOf(s)).toBe('open');
  });

  it('10:00 class starts, free time left → 65, seals after ~3.5 min', () => {
    const s = score(sig({ baseScore: 65, deficit: deficitAt(10, 0, 0), allowanceLeftMin: 60 }));
    expect(s).toBe(65);
    expect(bandOf(s)).toBe('sealed'); // the hold and grace that make it ~3.5 min are C3
  });

  it('10:30 contract-task quest done in class (1 of 5) → 65 + 0 − 15 = 50, Metered', () => {
    const s = score(sig({ baseScore: 65, deficit: deficitAt(10, 30, 1), minutesSinceWin: 0, allowanceLeftMin: 40 }));
    expect(s).toBe(50);
    expect(bandOf(s)).toBe('metered');
  });

  it('11:00 class ends, free time left, 10:30 win still counts → 0 (clamped), Open', () => {
    const s = score(sig({ deficit: deficitAt(11, 0, 1), minutesSinceWin: 30, allowanceLeftMin: 30 }));
    expect(s).toBe(0);
    expect(bandOf(s)).toBe('open');
  });

  it('15:00 free, 2 of 5 done, free time used up → 0 + 3 = 3, Open', () => {
    expect(deficitAt(15, 0, 2)).toBeCloseTo(0.1);
    const s = score(sig({ deficit: deficitAt(15, 0, 2) }));
    expect(s).toBe(3);
    expect(bandOf(s)).toBe('open');
  });

  it('22:45 wind-down, 2 of 5, scrolled 25 min, 3 opens in 15 min → 40+15+15+10 = 80, Sealed', () => {
    const d = deficitAt(22, 45, 2);
    expect(deficitPoints(d)).toBe(15);
    const s = score(sig({ baseScore: 40, deficit: d, scrollMinutes60: 25, urgeCount15: 3 }));
    expect(s).toBe(80);
    expect(bandOf(s)).toBe('sealed');
  });

  it('23:40 sleep window (deficit 0), scrolled 45 min → 70 + 25 = 95, Sealed', () => {
    const s = score(sig({ baseScore: 70, deficit: 0, scrollMinutes60: 45 }));
    expect(s).toBe(95);
    expect(bandOf(s)).toBe('sealed');
  });

  it('outside any declared block the score never exceeds 60', () => {
    let max = 0;
    for (const deficit of [0, 0.3, 0.5, 0.98, 1, 7])
      for (const scrollMinutes60 of [0, 19, 20, 40, 41, 120])
        for (const urgeCount15 of [0, 2, 3, 50])
          for (const minutesSinceWin of [null, 0, 59, 60, 500])
            for (const allowanceLeftMin of [0, 30]) {
              const s = score(sig({ deficit, scrollMinutes60, urgeCount15, minutesSinceWin, allowanceLeftMin }));
              max = Math.max(max, s);
            }
    expect(max).toBe(MAX_OUTSIDE_BLOCK);
    expect(MAX_OUTSIDE_BLOCK).toBe(60);
    expect(bandOf(max)).not.toBe('sealed');
  });
});

describe('score() — rules', () => {
  it('ignores deficit, scrolling and urges while free time is left', () => {
    const busy = { baseScore: 40, deficit: 0.6, scrollMinutes60: 50, urgeCount15: 4 };
    expect(score(sig({ ...busy, allowanceLeftMin: 1 }))).toBe(40);
    expect(score(sig({ ...busy, allowanceLeftMin: 0 }))).toBe(40 + 15 + 25 + 10);
  });

  it('scroll velocity bands do not stack: the higher one applies', () => {
    expect(velocityPoints(19.9)).toBe(0);
    expect(velocityPoints(20)).toBe(15);
    expect(velocityPoints(40)).toBe(15);
    expect(velocityPoints(40.1)).toBe(25);
  });

  it('urge repetition needs 3 or more opens', () => {
    expect(urgePoints(2)).toBe(0);
    expect(urgePoints(3)).toBe(10);
  });

  it('a win counts for 60 minutes', () => {
    expect(WIN_POINTS).toBe(-15);
    expect(score(sig({ baseScore: 65, minutesSinceWin: 59 }))).toBe(50);
    expect(score(sig({ baseScore: 65, minutesSinceWin: 60 }))).toBe(65);
  });

  it('missing or broken inputs count 0', () => {
    const broken = {
      baseScore: Number.NaN,
      deficit: Number.NaN,
      scrollMinutes60: -5,
      urgeCount15: Number.POSITIVE_INFINITY,
      minutesSinceWin: -3,
      allowanceLeftMin: Number.NaN,
    } as Signals;
    expect(score(broken)).toBe(0);
    expect(score({} as Signals)).toBe(0);
  });

  it('clamps to 0..100', () => {
    expect(score(sig({ baseScore: 70, deficit: 1, scrollMinutes60: 60, urgeCount15: 9 }))).toBe(100);
    expect(score(sig({ baseScore: 0, minutesSinceWin: 1 }))).toBe(0);
  });
});

describe('bandOf', () => {
  it('maps 0–34 Open, 35–64 Metered, 65–100 Sealed', () => {
    expect(bandOf(34)).toBe('open');
    expect(bandOf(35)).toBe('metered');
    expect(bandOf(64)).toBe('metered');
    expect(bandOf(65)).toBe('sealed');
  });
});
