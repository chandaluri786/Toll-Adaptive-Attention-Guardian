// OWNER: C (task C3). Weather transitions: enter at the band, exit 5 below, 2-reading hold,
// 90-s grace, and Storm only inside a declared block. Pure state machine, so no clock needed.
import type { Posture } from '../../contracts';
import { MIN } from '../../shared/emitter';
import {
  enforcedPosture,
  GRACE_MS,
  HOLD_READINGS,
  initialMachine,
  nextChangeOf,
  settle,
  step,
  targetFor,
  type MachineState,
  type Reading,
} from '../transitions';
import { DEFAULT_WEATHER, type WeatherConfig } from '../weatherConfig';

const T0 = new Date(2026, 10, 15, 10, 0, 30).getTime();
const reading = (i: number, score: number, declared = true): Reading => ({ at: T0 + i * MIN, score, declared });

/** Feed scores one minute apart; returns every state after each reading. */
function run(scores: number[], opts: { start?: Posture; declared?: boolean; cfg?: WeatherConfig } = {}) {
  const cfg = opts.cfg ?? DEFAULT_WEATHER;
  let s: MachineState = initialMachine(opts.start ?? 'open');
  const states: MachineState[] = [];
  scores.forEach((score, i) => {
    s = step(s, reading(i, score, opts.declared ?? true), cfg);
    states.push(s);
  });
  return states;
}
const postures = (states: MachineState[]) => states.map((s) => s.posture);
const changes = (states: MachineState[], start: Posture = 'open') =>
  postures(states).reduce((n, p, i, all) => (p !== (i === 0 ? start : all[i - 1]) ? n + 1 : n), 0);

describe('targetFor — enter at the band, leave 5 below', () => {
  it('enters Cloudy at 35 and Storm at 65', () => {
    expect(targetFor('open', 34, true, DEFAULT_WEATHER)).toBe('open');
    expect(targetFor('open', 35, true, DEFAULT_WEATHER)).toBe('metered');
    expect(targetFor('open', 64, true, DEFAULT_WEATHER)).toBe('metered');
    expect(targetFor('open', 65, true, DEFAULT_WEATHER)).toBe('sealed');
    expect(targetFor('metered', 65, true, DEFAULT_WEATHER)).toBe('sealed');
  });

  it('leaves Storm only below 60 and Cloudy only below 30', () => {
    expect(targetFor('sealed', 60, true, DEFAULT_WEATHER)).toBe('sealed');
    expect(targetFor('sealed', 59, true, DEFAULT_WEATHER)).toBe('metered');
    expect(targetFor('sealed', 29, true, DEFAULT_WEATHER)).toBe('open');
    expect(targetFor('metered', 30, true, DEFAULT_WEATHER)).toBe('metered');
    expect(targetFor('metered', 29, true, DEFAULT_WEATHER)).toBe('open');
  });

  it('never targets Storm without a declared block', () => {
    expect(targetFor('open', 100, false, DEFAULT_WEATHER)).toBe('metered');
    expect(targetFor('sealed', 100, false, DEFAULT_WEATHER)).toBe('metered');
  });
});

describe('step — two-reading hold', () => {
  it('a one-minute spike changes nothing', () => {
    const states = run([10, 80, 10, 10]);
    expect(postures(states)).toEqual(['open', 'open', 'open', 'open']);
  });

  it('commits on the second consecutive reading past the threshold', () => {
    expect(HOLD_READINGS).toBe(2);
    const states = run([70, 70]);
    expect(postures(states)).toEqual(['open', 'sealed']);
  });

  it('tightens to the band both readings agree on (62 then 66 is Cloudy, not Storm)', () => {
    expect(postures(run([62, 66]))).toEqual(['open', 'metered']);
  });

  it('loosens only after two readings below the exit line, to the looser of the two', () => {
    const states = run([50, 50], { start: 'sealed' });
    expect(postures(states)).toEqual(['sealed', 'metered']);
    expect(postures(run([20, 50], { start: 'sealed' }))).toEqual(['sealed', 'metered']);
    expect(postures(run([20, 20], { start: 'sealed' }))).toEqual(['sealed', 'open']);
  });
});

describe('step — 62–66 oscillation never flaps', () => {
  const wave = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 62 : 66));

  it('inside Storm it stays Storm the whole time', () => {
    const states = run(wave, { start: 'sealed' });
    expect(new Set(postures(states))).toEqual(new Set(['sealed']));
  });

  it('from Clear skies it settles on Cloudy once and never moves again', () => {
    const states = run(wave);
    expect(changes(states)).toBe(1);
    expect(postures(states).slice(1).every((p) => p === 'metered')).toBe(true);
  });

  it('from Cloudy it never reaches Storm', () => {
    const states = run(wave, { start: 'metered' });
    expect(changes(states, 'metered')).toBe(0);
  });

  it('a 58–62 wave inside Storm (around the 60 exit line) also never flaps', () => {
    const states = run(
      Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 58 : 62)),
      { start: 'sealed' },
    );
    expect(changes(states, 'sealed')).toBe(0);
  });
});

describe('step — 90-second grace', () => {
  it('every tightening starts with a 90-s advisory; enforcement stays on the old weather', () => {
    const [, committed] = run([70, 70]);
    expect(committed.posture).toBe('sealed');
    expect(committed.graceUntil).toBe(reading(1, 0).at + GRACE_MS);
    expect(enforcedPosture(committed)).toBe('open');
    expect(nextChangeOf(committed, DEFAULT_WEATHER)).toEqual({ at: reading(1, 0).at + GRACE_MS, to: 'sealed' });
  });

  it('Clear → Cloudy gets the same grace', () => {
    const [, committed] = run([40, 40]);
    expect(committed.posture).toBe('metered');
    expect(enforcedPosture(committed)).toBe('open');
  });

  it('grace ends after 90 s, not before', () => {
    const [, committed] = run([70, 70]);
    const at = committed.graceUntil as number;
    expect(enforcedPosture(settle(committed, at - 1))).toBe('open');
    const after = settle(committed, at);
    expect(after.graceUntil).toBeNull();
    expect(enforcedPosture(after)).toBe('sealed');
  });

  it('loosening has no grace', () => {
    const [, loosened] = run([50, 50], { start: 'sealed' });
    expect(loosened.graceUntil).toBeNull();
    expect(enforcedPosture(loosened)).toBe('metered');
  });

  it('Cloudy → Storm during the Cloudy grace keeps enforcing Clear skies, with a fresh 90 s', () => {
    const states = run([40, 70, 70]); // Cloudy commits on reading 1 (40 and 70 agree on Cloudy), Storm on reading 2
    const last = states[2];
    expect(last.posture).toBe('sealed');
    expect(enforcedPosture(last)).toBe('open');
    expect(last.graceUntil).toBe(reading(2, 0).at + GRACE_MS);
  });
});

describe('step — Storm is impossible without a current declared block', () => {
  it('a score of 100 outside a block stops at Cloudy', () => {
    const states = run([100, 100, 100, 100], { declared: false });
    expect(postures(states)).not.toContain('sealed');
    expect(postures(states).at(-1)).toBe('metered');
  });

  it('the block ending drops Storm at once, without waiting for the hold', () => {
    let s = run([70, 70, 70, 70]).at(-1) as MachineState;
    expect(s.posture).toBe('sealed');
    s = step(s, reading(4, 60, false), DEFAULT_WEATHER);
    expect(s.posture).toBe('metered');
    expect(s.graceUntil).toBeNull();
  });

  it('a block that ends mid-grace never lets the drop skip the advisory', () => {
    let s = run([70, 70]).at(-1) as MachineState; // sealed, grace, enforcing open
    s = step(s, { at: reading(1, 0).at + 30_000, score: 50, declared: false }, DEFAULT_WEATHER);
    expect(s.posture).toBe('metered');
    expect(enforcedPosture(s)).toBe('open');
    expect(s.graceUntil).not.toBeNull();
  });

  it('property: no random sequence ever shows Storm on a reading without a block', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let s = initialMachine('open');
    for (let i = 0; i < 2000; i++) {
      const r = { at: T0 + i * MIN, score: Math.floor(rand() * 101), declared: rand() < 0.5 };
      s = step(s, r, DEFAULT_WEATHER);
      if (!r.declared) expect(s.posture).not.toBe('sealed');
      if (!r.declared) expect(enforcedPosture(s)).not.toBe('sealed');
    }
  });
});

describe('the worked day through the machine', () => {
  it('10:00 class (65) seals after the hold plus grace; 10:30 win (50) unseals to Cloudy; 11:00 (0) clears', () => {
    // Readings every minute from 10:00:30. Class 10:00–11:00.
    let s = initialMachine('open');
    const at = (h: number, m: number, sec = 30) => new Date(2026, 10, 15, h, m, sec).getTime();
    s = step(s, { at: at(10, 0), score: 65, declared: true }, DEFAULT_WEATHER);
    expect(s.posture).toBe('open');
    s = step(s, { at: at(10, 1), score: 65, declared: true }, DEFAULT_WEATHER);
    expect(s.posture).toBe('sealed');
    expect(enforcedPosture(settle(s, at(10, 2)))).toBe('open'); // still the advisory
    expect(enforcedPosture(settle(s, at(10, 3)))).toBe('sealed'); // ~3 min after the class started
    for (let m = 2; m < 30; m++) s = step(s, { at: at(10, m), score: 65, declared: true }, DEFAULT_WEATHER);
    s = step(s, { at: at(10, 30), score: 50, declared: true }, DEFAULT_WEATHER);
    expect(s.posture).toBe('sealed'); // one reading below 60 is not enough
    s = step(s, { at: at(10, 31), score: 50, declared: true }, DEFAULT_WEATHER);
    expect(s.posture).toBe('metered');
    for (let m = 32; m < 60; m++) s = step(s, { at: at(10, m), score: 50, declared: true }, DEFAULT_WEATHER);
    s = step(s, { at: at(11, 0), score: 0, declared: false }, DEFAULT_WEATHER);
    s = step(s, { at: at(11, 1), score: 0, declared: false }, DEFAULT_WEATHER);
    expect(s.posture).toBe('open');
  });
});

describe('nextChangeOf', () => {
  it('is null when nothing is on the way', () => {
    expect(nextChangeOf(initialMachine('open'), DEFAULT_WEATHER)).toBeNull();
    expect(nextChangeOf(run([10, 10]).at(-1) as MachineState, DEFAULT_WEATHER)).toBeNull();
  });

  it('after one reading past the line, names the next reading (plus grace when tightening)', () => {
    const [first] = run([70]);
    expect(nextChangeOf(first, DEFAULT_WEATHER)).toEqual({ at: reading(1, 0).at + GRACE_MS, to: 'sealed' });
    const [down] = run([50], { start: 'sealed' });
    expect(nextChangeOf(down, DEFAULT_WEATHER)).toEqual({ at: reading(1, 0).at, to: 'metered' });
  });
});

describe('editable thresholds', () => {
  it('a lower Storm line re-reads the last readings, so the weather moves on the next reading', () => {
    const cfg: WeatherConfig = { cloudyAt: 35, stormAt: 45, exitGap: 5 };
    let s = run([50, 50, 50]).at(-1) as MachineState;
    expect(s.posture).toBe('metered');
    s = step(s, reading(3, 50), cfg);
    expect(s.posture).toBe('sealed');
  });

  it('a wider exit gap holds Storm lower', () => {
    const cfg: WeatherConfig = { cloudyAt: 35, stormAt: 65, exitGap: 10 };
    expect(targetFor('sealed', 56, true, cfg)).toBe('sealed');
    expect(targetFor('sealed', 54, true, cfg)).toBe('metered');
  });
});
