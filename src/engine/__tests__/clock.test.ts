// OWNER: C (task C1). The real clock: 60-s tick, monotonic reading, setNow + speed for the demo.
import { createClock, MAX_SPEED, TICK_MS, type Timers } from '../clock';

/** Hand-driven time and timers, so nothing here depends on real time. */
function harness(startWall = 1_000_000, startMono = 50) {
  let wall = startWall;
  let mono = startMono;
  let nextId = 1;
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  const timers: Timers = {
    setInterval: (fn, ms) => {
      const id = nextId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id as number);
    },
  };
  const advance = (ms: number) => {
    wall += ms;
    mono += ms;
  };
  const fire = () => intervals.forEach((t) => t.fn());
  const clock = createClock({ wallNow: () => wall, monoNow: () => mono, timers });
  return {
    clock,
    intervals,
    advance,
    fire,
    jumpWall: (ms: number) => {
      wall += ms;
    },
  };
}

describe('createClock — now()', () => {
  it('follows the wall clock at speed 1', () => {
    const h = harness();
    h.advance(5_000);
    expect(h.clock.now()).toBe(1_005_000);
  });

  it('setNow moves time and keeps running from there', () => {
    const h = harness();
    h.clock.setNow(42_000_000);
    h.advance(1_000);
    expect(h.clock.now()).toBe(42_001_000);
  });

  it('speed multiplies elapsed time from the moment it is set', () => {
    const h = harness();
    h.advance(1_000);
    h.clock.setSpeed(60);
    h.advance(1_000);
    expect(h.clock.now()).toBe(1_000_000 + 1_000 + 60_000);
    expect(h.clock.speed()).toBe(60);
  });

  it('rejects a non-finite setNow and clamps speed into (0, MAX_SPEED]', () => {
    const h = harness();
    expect(() => h.clock.setNow(Number.NaN)).toThrow();
    h.clock.setSpeed(0);
    expect(h.clock.speed()).toBe(1);
    h.clock.setSpeed(1e9);
    expect(h.clock.speed()).toBe(MAX_SPEED);
  });
});

describe('createClock — monotonic()', () => {
  it('ignores setNow, speed and wall-clock jumps', () => {
    const h = harness();
    const before = h.clock.monotonic();
    h.clock.setNow(0);
    h.clock.setSpeed(100);
    h.jumpWall(-3_600_000);
    h.advance(2_000);
    expect(h.clock.monotonic() - before).toBe(2_000);
  });
});

describe('createClock — ticks', () => {
  it('starts no timer until someone subscribes, and stops after the last unsubscribes', () => {
    const h = harness();
    expect(h.intervals.size).toBe(0);
    const offA = h.clock.onTick(() => {});
    const offB = h.clock.onTick(() => {});
    expect(h.intervals.size).toBe(1);
    expect([...h.intervals.values()][0].ms).toBe(TICK_MS);
    offA();
    expect(h.intervals.size).toBe(1);
    offB();
    expect(h.intervals.size).toBe(0);
  });

  it('emits the current clock time on each timer fire', () => {
    const h = harness();
    const seen: number[] = [];
    h.clock.onTick((t) => seen.push(t));
    h.advance(TICK_MS);
    h.fire();
    expect(seen).toEqual([1_000_000 + TICK_MS]);
  });

  it('shortens the real tick interval with speed so a sped-up demo still ticks every clock minute', () => {
    const h = harness();
    h.clock.onTick(() => {});
    h.clock.setSpeed(60);
    expect(h.intervals.size).toBe(1);
    expect([...h.intervals.values()][0].ms).toBe(TICK_MS / 60);
  });

  it('tick() and setNow() emit at once', () => {
    const h = harness();
    const seen: number[] = [];
    h.clock.onTick((t) => seen.push(t));
    h.clock.tick();
    h.clock.setNow(7_000_000);
    expect(seen).toEqual([1_000_000, 7_000_000]);
  });

  it('stop() clears the timer and drops subscribers', () => {
    const h = harness();
    const seen: number[] = [];
    h.clock.onTick((t) => seen.push(t));
    h.clock.stop();
    expect(h.intervals.size).toBe(0);
    h.clock.tick();
    expect(seen).toEqual([]);
  });
});
