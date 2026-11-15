// OWNER: C (Spec C — task C2). See docs/specs/C-engine-cloud.md and "Scoring" in the planning doc.
//
// Focus Pressure, 0..100, as a pure function. The worked-day table in the planning doc is the
// test suite (src/engine/__tests__/scoring.test.ts): turn each it.todo into a real test as you go.
import type { Signals } from '../contracts';

/** Points for the plan deficit: round(25 × deficit), halves round up. */
export function deficitPoints(deficit: number): number {
  return Math.floor(25 * deficit + 0.5);
}

/**
 * The score for one 60-s tick.
 * Rules to implement (Scoring section of the planning doc):
 * - base from the current declared block (0 outside blocks);
 * - while allowanceLeftMin > 0, only the base and the recent-win discount count;
 * - after free time: + deficit points, + scroll velocity (15 or 25, not stacked), + urge (10);
 * - recent win within 60 min: −15; clamp to 0..100.
 */
export function score(_signals: Signals): number {
  throw new Error('score() not implemented yet — task C2');
}
