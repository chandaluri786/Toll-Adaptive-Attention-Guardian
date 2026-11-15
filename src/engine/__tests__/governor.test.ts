// OWNER: C (task C4). One emergency unlock per local day (reset 04:00), 15 min of every app, logged.
import { createGovernor, EMERGENCY_KEY, EMERGENCY_MS } from '../governor';
import { createMemoryKV, ENGINE_PREFIX } from '../kv';

/** Local wall time (never UTC), so the suite means the same thing in any TZ. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

function harness(start = at(15, 10)) {
  let now = start;
  const kv = createMemoryKV();
  const clock = { now: () => now, onTick: () => () => {} };
  const governor = createGovernor({ clock, kv });
  return { kv, governor, setNow: (t: number) => (now = t) };
}

describe('createGovernor — emergencyUnlock', () => {
  it('opens a 15-minute window over every app', () => {
    const { governor } = harness();
    const w = governor.emergencyUnlock();
    expect(w).toEqual({ id: `em-${at(15, 10)}`, scope: 'all', until: at(15, 10) + EMERGENCY_MS, source: 'emergency' });
    expect(EMERGENCY_MS).toBe(15 * 60_000);
  });

  it('works once a day: null after, and emergencyLeftToday goes 1 → 0', () => {
    const { governor, setNow } = harness();
    expect(governor.emergencyLeftToday()).toBe(1);
    governor.emergencyUnlock();
    expect(governor.emergencyLeftToday()).toBe(0);
    setNow(at(15, 22));
    expect(governor.emergencyUnlock()).toBeNull();
  });

  it('stays used past midnight and comes back at 04:00 local', () => {
    const { governor, setNow } = harness(at(15, 23, 30));
    governor.emergencyUnlock();
    setNow(at(16, 0, 30));
    expect(governor.emergencyLeftToday()).toBe(0);
    setNow(at(16, 3, 59));
    expect(governor.emergencyUnlock()).toBeNull();
    setNow(at(16, 4, 0));
    expect(governor.emergencyLeftToday()).toBe(1);
    expect(governor.emergencyUnlock()).not.toBeNull();
  });

  it('an unlock at 03:00 belongs to the day before', () => {
    const { governor, setNow } = harness(at(16, 3));
    governor.emergencyUnlock();
    setNow(at(16, 9));
    expect(governor.emergencyLeftToday()).toBe(1);
  });
});

describe('createGovernor — log', () => {
  it('records each use with its timestamp and reports them per local day', () => {
    const { governor, setNow } = harness(at(15, 10));
    governor.emergencyUnlock();
    setNow(at(16, 2));
    governor.emergencyUnlock(); // still 15th's day → refused, not logged
    setNow(at(16, 8));
    governor.emergencyUnlock();
    expect(governor.log()).toEqual([at(15, 10), at(16, 8)]);
    expect(governor.unlocksOn('2026-11-15')).toEqual([at(15, 10)]);
    expect(governor.unlocksOn('2026-11-16')).toEqual([at(16, 8)]);
    expect(governor.unlocksOn('2026-11-17')).toEqual([]);
  });

  it('persists under engine: and survives a restart', () => {
    const { kv, governor } = harness();
    governor.emergencyUnlock();
    expect(kv.keys()).toEqual([ENGINE_PREFIX + EMERGENCY_KEY]);
    const clock = { now: () => at(15, 18), onTick: () => () => {} };
    const again = createGovernor({ clock, kv });
    expect(again.emergencyLeftToday()).toBe(0);
    expect(again.log()).toEqual([at(15, 10)]);
  });

  it('treats corrupt or odd storage as an empty log (never locks the user out)', () => {
    const kv = createMemoryKV();
    const clock = { now: () => at(15, 10), onTick: () => () => {} };
    kv.set(EMERGENCY_KEY, '{not json');
    expect(createGovernor({ clock, kv }).emergencyLeftToday()).toBe(1);
    kv.set(EMERGENCY_KEY, JSON.stringify({ a: 1 }));
    expect(createGovernor({ clock, kv }).emergencyLeftToday()).toBe(1);
    kv.set(EMERGENCY_KEY, JSON.stringify([at(14, 10), 'x', null]));
    expect(createGovernor({ clock, kv }).log()).toEqual([at(14, 10)]);
  });

  it('drops entries older than the 180-day Forecast window', () => {
    const kv = createMemoryKV();
    const old = at(15, 10) - 200 * 86_400_000;
    kv.set(EMERGENCY_KEY, JSON.stringify([old, at(14, 10)]));
    const clock = { now: () => at(15, 10), onTick: () => () => {} };
    const governor = createGovernor({ clock, kv });
    governor.emergencyUnlock();
    expect(governor.log()).toEqual([at(14, 10), at(15, 10)]);
  });

  it('reset() clears the log and gives today back', () => {
    const { kv, governor } = harness();
    governor.emergencyUnlock();
    governor.reset();
    expect(governor.emergencyLeftToday()).toBe(1);
    expect(governor.log()).toEqual([]);
    expect(kv.keys()).toEqual([]);
  });

  it('log() hands out a copy', () => {
    const { governor } = harness();
    governor.emergencyUnlock();
    (governor.log() as number[]).push(1);
    expect(governor.log()).toHaveLength(1);
  });
});
