// OWNER: C (task C11). The two "should ship" economy rules as pure functions: diminishing returns
// on repeated quests of one category, and the late-night 2× cost. Times are local wall time.
import { isLateNight, LATE_NIGHT_MULTIPLIER, REPEAT_PERCENT, repeatPercent, spendCost } from '../economy';
import { mintFor } from '../events';

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

describe('repeatPercent: 100% / 60% / 30% / 0', () => {
  it('follows the planning doc for the 1st to 4th quest of a category in a day', () => {
    // Arrange
    const repeats = [0, 1, 2, 3];

    // Act
    const percents = repeats.map(repeatPercent);

    // Assert
    expect(REPEAT_PERCENT).toEqual([100, 60, 30, 0]);
    expect(percents).toEqual([100, 60, 30, 0]);
  });

  it('stays 0 past the 4th and treats a bad count as the first', () => {
    expect(repeatPercent(9)).toBe(0);
    expect(repeatPercent(-1)).toBe(100);
    expect(repeatPercent(NaN)).toBe(100);
    expect(repeatPercent(1.7)).toBe(60);
  });
});

describe('mintFor with repeats', () => {
  it('fitness pays 25, 15, 8 (7.5 rounds half-up), then 0', () => {
    expect([0, 1, 2, 3].map((n) => mintFor('fitness', 1, 0, n))).toEqual([25, 15, 8, 0]);
  });

  it('focus pays 15, 9, 5 (4.5 rounds half-up), then 0', () => {
    expect([0, 1, 2, 3].map((n) => mintFor('focus', 1, 0, n))).toEqual([15, 9, 5, 0]);
  });

  it('stacks with the claim-half rate (focus at 0.5, 2nd: 4.5 → 5)', () => {
    expect(mintFor('focus', 0.5, 0, 1)).toBe(5);
    expect(mintFor('fitness', 0.5, 0, 2)).toBe(4); // 3.75
  });

  it('applies before the cap', () => {
    expect(mintFor('fitness', 1, 140, 1)).toBe(10); // 15, but only 10 left
  });

  it('defaults to a first quest', () => {
    expect(mintFor('coding', 1, 0)).toBe(20);
  });
});

describe('isLateNight: from 23:00 to the 04:00 reset', () => {
  it.each([
    [22, 59, false],
    [23, 0, true],
    [23, 30, true],
    [0, 0, true],
    [3, 59, true],
    [4, 0, false],
    [14, 0, false],
  ])('%i:%i → %s', (h, m, expected) => {
    expect(isLateNight(at(16, h, m))).toBe(expected);
  });
});

describe('spendCost', () => {
  it('is 1:1 in the day and 2× after 23:00', () => {
    expect(LATE_NIGHT_MULTIPLIER).toBe(2);
    expect(spendCost(15, at(16, 14))).toBe(15);
    expect(spendCost(15, at(16, 23, 30))).toBe(30);
    expect(spendCost(15, at(17, 2))).toBe(30);
  });
});
