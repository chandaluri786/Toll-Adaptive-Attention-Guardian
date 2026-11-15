import type { LocationSample } from '../../contracts';
import { MIN } from '../../shared/emitter';
import {
  distanceM,
  isAwaySample,
  levenshtein,
  matchMeetupCode,
  verifyAwayFromHome,
  verifyMeetup,
  verifyScreenOff,
  verifySteps,
} from '../verifiers';
import { generateMeetupCode, MEETUP_WORDS } from '../wordlist';

const HOME = { lat: 33.4242, lon: -111.9281 };
const T0 = 1_763_100_000_000;

/** Same shape as A's fake `walkAway`: one sample a minute, `metres` north of home. */
function walk(metres: number, minutes: number, opts: Partial<LocationSample> = {}, start = T0): LocationSample[] {
  const dLat = metres / 111_320;
  return Array.from({ length: minutes }, (_, i) => ({
    at: start + i * MIN,
    lat: HOME.lat + dLat,
    lon: HOME.lon,
    accuracyM: 20,
    mocked: false,
    ...opts,
  }));
}

describe('verifySteps (B4)', () => {
  test('passes at the target after a real walk', () => {
    const v = verifySteps('q1', 2_050, 20, 2_000);
    expect(v).toMatchObject({ questId: 'q1', pass: true, method: 'step_delta', flags: [] });
    expect(v.measured).toBe('2,050 of 2,000');
  });

  test('a miss shows the real number', () => {
    const v = verifySteps('q1', 620, 12, 2_000);
    expect(v.pass).toBe(false);
    expect(v.measured).toBe('620 of 2,000');
  });

  test('rejects anything under 5 minutes, even with enough steps', () => {
    const v = verifySteps('q1', 2_000, 4, 2_000);
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/5 min/);
  });

  test('flags over 200 steps a minute but still passes (soft)', () => {
    const v = verifySteps('q1', 2_400, 10, 2_000);
    expect(v.pass).toBe(true);
    expect(v.flags).toContain('implausible_pace');
  });

  test('never uses the word "failed"', () => {
    expect(verifySteps('q1', 0, 30, 2_000).reason.toLowerCase()).not.toContain('fail');
  });
});

describe('verifyScreenOff (B5)', () => {
  test('25 minutes off passes', () => {
    const v = verifyScreenOff('q2', [{ at: T0, on: false }, { at: T0 + 25 * MIN, on: true }], 25);
    expect(v).toMatchObject({ pass: true, method: 'screen_off', measured: '25 of 25 min' });
  });

  test('any screen-on resets the timer', () => {
    const events = [
      { at: T0, on: false },
      { at: T0 + 15 * MIN, on: true },
      { at: T0 + 16 * MIN, on: false },
      { at: T0 + 30 * MIN, on: true },
    ];
    const v = verifyScreenOff('q2', events, 25);
    expect(v.pass).toBe(false);
    expect(v.measured).toBe('15 of 25 min');
  });

  test('an open stretch counts up to now', () => {
    const v = verifyScreenOff('q2', [{ at: T0, on: false }], 25, T0 + 26 * MIN);
    expect(v.pass).toBe(true);
  });

  test('order of events does not matter', () => {
    const v = verifyScreenOff('q2', [{ at: T0 + 25 * MIN, on: true }, { at: T0, on: false }], 25);
    expect(v.pass).toBe(true);
  });

  test('no events means no progress', () => {
    expect(verifyScreenOff('q2', [], 25).measured).toBe('0 of 25 min');
  });
});

describe('verifyAwayFromHome (B6)', () => {
  test('the fake 600 m track passes at 45 minutes', () => {
    const v = verifyAwayFromHome('q3', walk(600, 45), HOME, 45);
    expect(v).toMatchObject({ pass: true, method: 'away_minutes', measured: '45 of 45 min' });
  });

  test('44 minutes is not enough', () => {
    expect(verifyAwayFromHome('q3', walk(600, 44), HOME, 45).pass).toBe(false);
  });

  test('a mocked sample fails at once', () => {
    const samples = [...walk(600, 45), ...walk(600, 1, { mocked: true }, T0 + 45 * MIN)];
    const v = verifyAwayFromHome('q3', samples, HOME, 45);
    expect(v.pass).toBe(false);
    expect(v.flags).toContain('mocked_location');
  });

  test('too close gives the distance in plain words', () => {
    const v = verifyAwayFromHome('q3', walk(200, 45), HOME, 45);
    expect(v.pass).toBe(false);
    expect(v.reason).toBe("You're 200 m from home — need 500 m");
  });

  test('accuracy worse than 100 m resets the run', () => {
    const samples = [
      ...walk(600, 30),
      ...walk(600, 1, { accuracyM: 150 }, T0 + 30 * MIN),
      ...walk(600, 30, {}, T0 + 31 * MIN),
    ];
    const v = verifyAwayFromHome('q3', samples, HOME, 45);
    expect(v.pass).toBe(false);
    expect(v.measured).toBe('30 of 45 min');
  });

  test('a gap in samples resets the run', () => {
    const samples = [...walk(600, 30), ...walk(600, 30, {}, T0 + 40 * MIN)];
    expect(verifyAwayFromHome('q3', samples, HOME, 45).pass).toBe(false);
  });
});

describe('meetup code (B7)', () => {
  const code: [string, string, string] = ['BEACH', 'TRUCK', 'WHEAT'];

  test('levenshtein basics', () => {
    expect(levenshtein('BEACH', 'BEACH')).toBe(0);
    expect(levenshtein('BEACH', 'BEAH')).toBe(1);
    expect(levenshtein('TRUCK', 'TRVCX')).toBe(2);
  });

  test('exact text matches', () => {
    expect(matchMeetupCode('BEACH TRUCK WHEAT', code)).toBe(true);
  });

  test('2 of 3 words, each within distance 2, is enough', () => {
    expect(matchMeetupCode('8EACH\nTRVCK\n???', code)).toBe(true);
  });

  test('only 1 word read is not enough', () => {
    expect(matchMeetupCode('BEACH and some noise', code)).toBe(false);
  });

  test('a different code does not match', () => {
    expect(matchMeetupCode('HARP SNACK DUST', code)).toBe(false);
  });

  test('lowercase handwriting is fine', () => {
    expect(matchMeetupCode('beach, truck.', code)).toBe(true);
  });

  test('verifyMeetup needs the code and the distance', () => {
    const away = walk(600, 1)[0];
    const near = walk(200, 1)[0];
    expect(verifyMeetup('q4', 'BEACH TRUCK WHEAT', code, away, HOME).pass).toBe(true);
    const unread = verifyMeetup('q4', '', code, away, HOME);
    expect(unread.pass).toBe(false);
    expect(unread.reason).toBe("Couldn't read it — try larger letters");
    expect(verifyMeetup('q4', 'BEACH TRUCK WHEAT', code, near, HOME).reason).toBe(
      "You're 200 m from home — need 500 m",
    );
    expect(verifyMeetup('q4', 'BEACH TRUCK WHEAT', code, { ...away, mocked: true }, HOME).pass).toBe(false);
    expect(verifyMeetup('q4', 'BEACH TRUCK WHEAT', code, null, HOME).pass).toBe(false);
  });
});

describe('wordlist', () => {
  test('words are 4–6 capital letters with no I, L or O', () => {
    for (const w of MEETUP_WORDS) expect(w).toMatch(/^[A-HJKMNP-Z]{4,6}$/);
  });

  test('generates three different words', () => {
    let seed = 0.1;
    const rng = () => (seed = (seed * 9301 + 0.49297) % 1);
    const code = generateMeetupCode(rng);
    expect(new Set(code).size).toBe(3);
    code.forEach((w) => expect(MEETUP_WORDS).toContain(w));
  });
});

describe('helpers', () => {
  test('isAwaySample: far, accurate and real', () => {
    expect(isAwaySample(walk(600, 1)[0], HOME)).toBe(true);
    expect(isAwaySample(walk(400, 1)[0], HOME)).toBe(false);
    expect(isAwaySample(walk(600, 1, { accuracyM: 101 })[0], HOME)).toBe(false);
  });

  test('distanceM is about right', () => {
    expect(Math.round(distanceM(HOME, walk(600, 1)[0]))).toBeGreaterThan(595);
  });
});
