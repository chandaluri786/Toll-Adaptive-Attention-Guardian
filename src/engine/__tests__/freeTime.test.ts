// OWNER: C (task C2). Free time: 120 min a day, counted down by Restricted use, back at 04:00 local.
import { createFreeTime, FREE_TIME_KEY, FREE_TIME_MIN } from '../freeTime';
import { createMemoryKV, ENGINE_PREFIX, type KV } from '../kv';

const MIN = 60_000;
/** Local wall time (never UTC), so the suite means the same thing in any TZ. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

function harness(start = at(15, 9), kv: KV = createMemoryKV()) {
  let now = start;
  const clock = { now: () => now, onTick: () => () => {} };
  const freeTime = createFreeTime({ clock, kv });
  return { kv, freeTime, setNow: (t: number) => (now = t) };
}

describe('createFreeTime', () => {
  it('starts each day with 120 minutes', () => {
    expect(FREE_TIME_MIN).toBe(120);
    expect(harness().freeTime.leftMin()).toBe(120);
  });

  it('counts down by use and reaches exactly 0, never below', () => {
    const { freeTime } = harness();
    freeTime.use(MIN);
    expect(freeTime.leftMin()).toBe(119);
    freeTime.use(30_000);
    expect(freeTime.leftMin()).toBe(119); // 118.5 left still shows as 119 until it is really gone
    freeTime.use(200 * MIN);
    expect(freeTime.leftMin()).toBe(0);
  });

  it('ignores zero, negative and non-finite use', () => {
    const { freeTime } = harness();
    freeTime.use(-MIN);
    freeTime.use(Number.NaN);
    expect(freeTime.leftMin()).toBe(120);
  });

  it('resets at 04:00 local, and 03:59 still belongs to yesterday', () => {
    const { freeTime, setNow } = harness(at(15, 22));
    freeTime.use(120 * MIN);
    setNow(at(16, 3, 59));
    expect(freeTime.leftMin()).toBe(0);
    setNow(at(16, 4, 0));
    expect(freeTime.leftMin()).toBe(120);
  });

  it('is stored under engine: and survives a restart', () => {
    const first = harness();
    first.freeTime.use(45 * MIN);
    expect(first.kv.keys()).toEqual([ENGINE_PREFIX + FREE_TIME_KEY]);
    const second = harness(at(15, 9), first.kv);
    expect(second.freeTime.leftMin()).toBe(75);
  });

  it('treats corrupt storage as a fresh day (fails open)', () => {
    const kv = createMemoryKV();
    kv.set(FREE_TIME_KEY, '{not json');
    expect(harness(at(15, 9), kv).freeTime.leftMin()).toBe(120);
    kv.set(FREE_TIME_KEY, JSON.stringify({ day: '2026-11-15', usedMs: 'lots' }));
    expect(harness(at(15, 9), kv).freeTime.leftMin()).toBe(120);
  });

  it('setLeft forces the minutes left (demo panel), clamped to 0..120', () => {
    const { freeTime } = harness();
    freeTime.setLeft(0);
    expect(freeTime.leftMin()).toBe(0);
    freeTime.setLeft(500);
    expect(freeTime.leftMin()).toBe(120);
    freeTime.setLeft(30);
    expect(freeTime.leftMin()).toBe(30);
  });

  it('reset gives the whole 120 back', () => {
    const { freeTime } = harness();
    freeTime.use(90 * MIN);
    freeTime.reset();
    expect(freeTime.leftMin()).toBe(120);
  });
});
