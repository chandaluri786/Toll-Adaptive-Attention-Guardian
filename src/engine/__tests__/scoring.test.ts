// OWNER: C (task C2). The worked-day rows from the planning doc, waiting to become real tests.
// Waking day 07:00–23:00, 5 tasks, free time runs out at 13:00.
import { deficitPoints } from '../scoring';

describe('deficitPoints', () => {
  it('rounds halves up (15:00, 2 of 5 done: deficit 0.10 → +3)', () => {
    expect(deficitPoints(0.1)).toBe(3);
  });
  it('is 0 with no deficit', () => {
    expect(deficitPoints(0)).toBe(0);
  });
});

describe('score() — worked day (task C2)', () => {
  it.todo('09:00 free, 0 of 5 done, free time left → 0, Open');
  it.todo('10:00 class starts, free time left → 65, seals after ~3.5 min');
  it.todo('10:30 contract-task quest done in class (1 of 5) → 65 + 0 − 15 = 50, Metered');
  it.todo('11:00 class ends, free time left, 10:30 win still counts → 0 (clamped), Open');
  it.todo('15:00 free, 2 of 5 done, free time used up → 0 + 3 = 3, Open');
  it.todo('22:45 wind-down, 2 of 5, scrolled 25 min, 3 opens in 15 min → 40+15+15+10 = 80, Sealed');
  it.todo('23:40 sleep window (deficit 0), scrolled 45 min → 70 + 25 = 95, Sealed');
  it.todo('outside any declared block the score never exceeds 60');
});
