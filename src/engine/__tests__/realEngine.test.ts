// OWNER: C (session 5). Real C (engine + ledger) wired with A's and B's fakes, the way services.ts
// does it after integration step 1: clock → signals → score → weather → ledger, end to end.
// Scenarios from the planning doc: S1 (class at 09:58 → Storm), S2 (Cloudy spend), S3-style Storm
// quest, S5 (emergency unlock once a day, back at 04:00), plus history() inputs.
import type { PostureState, Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createMemoryKV as createLedgerKV } from '../../ledger/kv';
import { createFakeLedger } from '../../ledger/fakes';
import { obeyedPosture, unlocksVia, wireLedger } from '../../ledger/wiring';
import { MIN } from '../../shared/emitter';
import { createClock } from '../clock';
import { createFakeEngine } from '../fakes';
import { createMemoryKV } from '../kv';
import { createRealEngine, type Timeouts } from '../real';
import { GRACE_MS } from '../transitions';

/** Local time on the build-weekend Monday (Nov 16, 2026); never UTC. */
const at = (h: number, m = 0, s = 0, day = 16) => new Date(2026, 10, day, h, m, s).getTime();

function setup(start = at(9, 58, 30)) {
  let wall = start;
  const pending: { fn: () => void; ms: number }[] = [];
  const timeouts: Timeouts = {
    setTimeout: (fn, ms) => {
      const t = { fn, ms };
      pending.push(t);
      return t;
    },
    clearTimeout: (h) => {
      const i = pending.indexOf(h as (typeof pending)[number]);
      if (i >= 0) pending.splice(i, 1);
    },
  };
  const clock = createClock({ wallNow: () => wall, monoNow: () => wall, timers: { setInterval: () => 0, clearInterval: () => {} } });
  const services = {} as Services;
  const get = () => services;
  const engine = createRealEngine(get, { kv: createMemoryKV(), clock, timeouts });
  const ledger = wireLedger(get, createLedgerKV());
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  Object.assign(services, engine.services, ledger.services, device.services, day.services);
  const seen: PostureState[] = [];
  services.postureSource.subscribe((s) => seen.push(s)); // first use starts the readings
  services.ledger.balance(); // first use starts the day tracker
  return {
    services,
    engine,
    ledger,
    device,
    day,
    seen,
    pending,
    /** Move wall time on by `ms` without a tick. */
    wait: (ms: number) => (wall += ms),
    /** One clock minute and its 60-s tick. */
    minute: (n = 1) => {
      for (let i = 0; i < n; i++) {
        wall += MIN;
        clock.tick();
      }
    },
    /** Fire the scheduled grace-end check. */
    fireTimeouts: () => pending.splice(0).forEach((t) => t.fn()),
  };
}

const sorted = (o: object) => Object.keys(o).sort();

describe('createRealEngine + wireLedger with fakes of A and B', () => {
  test('have the fake shapes, debug included', () => {
    // Arrange
    const { engine, ledger } = setup();
    const fakeEngine = createFakeEngine();
    const fakeLedger = createFakeLedger(() => ({}) as Services);

    // Assert
    expect(sorted(engine.services)).toEqual(sorted(fakeEngine.services));
    expect(sorted(engine.debug)).toEqual([...sorted(fakeEngine.debug), 'freeTime', 'weather'].sort());
    for (const key of sorted(fakeEngine.debug.clock)) expect(engine.debug.clock).toHaveProperty(key);
    for (const key of sorted(fakeEngine.debug.postureSource)) expect(engine.debug.postureSource).toHaveProperty(key);
    for (const key of sorted(fakeEngine.debug.governor)) expect(engine.debug.governor).toHaveProperty(key);
    expect(sorted(ledger.services.ledger)).toEqual(sorted(fakeLedger.services.ledger));
    expect(sorted(ledger.debug)).toEqual(sorted(fakeLedger.debug));
  });

  test('never calls get() while being built', () => {
    // Arrange
    const get = jest.fn(() => ({}) as Services);
    const clock = createClock({ wallNow: () => at(9), timers: { setInterval: () => 0, clearInterval: () => {} } });

    // Act
    createRealEngine(get, { kv: createMemoryKV(), clock });
    wireLedger(get, createLedgerKV());

    // Assert
    expect(get).not.toHaveBeenCalled();
  });

  test('S1: a class at 09:58 turns Storm with the class reason, enforced when the 90 s are up', () => {
    // Arrange
    const h = setup(at(9, 58, 30));
    expect(h.services.postureSource.get().posture).toBe('open');

    // Act: readings at 09:59:30, 10:00:30 (first in class), 10:01:30 (hold met → Storm advisory)
    h.minute(3);
    const graced = h.services.postureSource.get();

    // Assert
    expect(graced).toMatchObject({ posture: 'sealed', grace: true, reasonCode: 'schedule' });
    expect(graced.reason).toContain("Storm until 11:00 — you're in Algorithms");
    expect(h.engine.debug.postureSource.enforced()).toBe('open');
    expect(h.pending).toHaveLength(1);
    expect(h.pending[0].ms).toBe(GRACE_MS);

    // Act: the grace-end timer fires 90 s later, with no tick in between
    h.wait(GRACE_MS);
    h.fireTimeouts();

    // Assert
    expect(h.seen.at(-1)).toMatchObject({ posture: 'sealed', grace: false });
    expect(h.engine.debug.postureSource.enforced()).toBe('sealed');
    expect(h.seen.at(-1)?.nextChange).toEqual({ at: at(11), to: 'open' });
  });

  test('S2: Cloudy from scrolling past free time, umbrella 30, spend 15 → a window opens and the balance reads 15', () => {
    // Arrange: 14:00, no block; free time used up, then 45 min of Instagram in the last hour (+25),
    // 3 Storm-screen opens in 15 min (+10) and a small plan deficit (+1) → 36, over the Cloudy line
    const h = setup(at(14, 0, 30));
    h.engine.debug.postureSource.setAllowance(0);
    for (let i = 0; i < 45 * 60; i++) h.device.debug.emitSample();
    for (let i = 0; i < 3; i++) h.device.debug.emitIntercept();
    h.ledger.debug.setBalance(30);

    // Act: two readings agree → Cloudy advisory; then the 90 s pass
    h.minute(2);
    h.wait(GRACE_MS);
    h.fireTimeouts();
    const result = h.services.ledger.spend(15, 'restricted');

    // Assert
    expect(h.services.postureSource.get()).toMatchObject({ posture: 'metered', grace: false, reasonCode: 'scrolling' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.window).toMatchObject({ scope: 'restricted', source: 'spend', until: at(14, 2, 30) + GRACE_MS + 15 * MIN });
    expect(h.services.ledger.balance()).toBe(15);
    expect(h.services.ledger.activeWindows()).toHaveLength(1);
  });

  test('Storm: spending is refused, a passed quest opens a window at once and the balance is unchanged', () => {
    // Arrange: inside Algorithms, Storm enforced, umbrella 30
    const h = setup(at(10, 0, 30));
    h.minute(2);
    h.wait(GRACE_MS);
    h.fireTimeouts();
    h.ledger.debug.setBalance(30);
    expect(h.engine.debug.postureSource.enforced()).toBe('sealed');

    // Act
    const spend = h.services.ledger.spend(15, 'restricted');
    h.day.debug.passActive(); // fake day credits a fitness quest at rate 1 through get().ledger

    // Assert
    expect(spend).toEqual({ ok: false, shortfall: 15 });
    const windows = h.services.ledger.activeWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ source: 'quest', scope: 'restricted' });
    expect(windows[0].until - h.services.clock.now()).toBe(25 * MIN);
    expect(h.services.ledger.balance()).toBe(30);
  });

  test('during the 90-s advisory the old weather still rules the ledger', () => {
    // Arrange: Storm shown with grace, nothing enforced yet
    const h = setup(at(10, 0, 30));
    h.minute(2);
    h.ledger.debug.setBalance(30);
    expect(h.services.postureSource.get()).toMatchObject({ posture: 'sealed', grace: true });

    // Act
    const result = h.services.ledger.spend(10, 'restricted');

    // Assert
    expect(result.ok).toBe(true);
    expect(h.services.ledger.balance()).toBe(20);
  });

  test('S5: the emergency unlock works once a day and comes back at 04:00', () => {
    // Arrange
    const h = setup(at(15));
    const { governor, clock } = h.services;

    // Act
    const first = governor.emergencyUnlock();
    const second = governor.emergencyUnlock();
    h.engine.debug.clock.setNow(at(3, 59, 0, 17)); // still the same local day
    const beforeReset = governor.emergencyLeftToday();
    h.engine.debug.clock.setNow(at(4, 0, 0, 17));

    // Assert
    expect(first).toEqual({ id: `em-${at(15)}`, scope: 'all', until: at(15, 15), source: 'emergency' });
    expect(second).toBeNull();
    expect(beforeReset).toBe(0);
    expect(governor.emergencyLeftToday()).toBe(1);
    expect(clock.now()).toBe(at(4, 0, 0, 17));
    expect(governor.emergencyUnlock()).not.toBeNull();
  });

  test('history() carries Storm minutes, Restricted minutes, emergency unlocks and plan progress', () => {
    // Arrange: Storm from 10:01:30 (shown) in Algorithms; 2 minutes of Instagram earlier
    const h = setup(at(9, 58, 30));
    for (let i = 0; i < 120; i++) h.device.debug.emitSample();
    h.minute(3); // ticks at 09:59:30, 10:00:30, 10:01:30 (the last turns Storm)

    // Act
    h.minute(5); // five more Storm minutes (the tick that turned Storm counts too: 6)
    h.services.governor.emergencyUnlock();
    h.day.debug.passActive(); // plan 2 → 3 of 5
    const [today] = h.services.ledger.history(1);

    // Assert
    expect(today.date).toBe('2026-11-16');
    expect(today.restrictedMin).toBe(2);
    expect(today.stormMin).toBe(6);
    expect(today.emergencyUnlocks).toEqual([at(10, 6, 30)]);
    expect(today).toMatchObject({ tasksPlanned: 5, tasksDone: 3 });
    expect(today.questsByCategory).toEqual({ fitness: 1 });
  });

  test('demo panel: forced weather, forced free time and seeds', () => {
    // Arrange
    const h = setup(at(14));

    // Act + Assert: force Storm (bare reason outside a block), then hand control back
    h.engine.debug.postureSource.setPosture('sealed');
    expect(h.services.postureSource.get()).toMatchObject({ posture: 'sealed', score: 75, grace: false, nextChange: null });
    expect(obeyedPosture(h.services.postureSource.get())).toBe('sealed');
    h.engine.debug.postureSource.setPosture(null);
    expect(h.services.postureSource.get().posture).toBe('open');

    h.engine.debug.postureSource.setAllowance(30);
    expect(h.services.postureSource.get().allowanceLeftMin).toBe(30);

    h.engine.debug.clock.setSpeed(10);
    expect(h.engine.debug.clock.speed()).toBe(10);

    h.engine.debug.seed('late_night');
    expect(h.seen.at(-1)).toMatchObject({ posture: 'sealed', allowanceLeftMin: 0 });
    h.engine.debug.seed('fresh');
    expect(h.services.postureSource.get()).toMatchObject({ posture: 'open', allowanceLeftMin: 120 });
  });

  test('the ledger reads unlocks only from a governor that logs them', () => {
    expect(unlocksVia(undefined, '2026-11-16')).toEqual([]);
    expect(unlocksVia({ emergencyUnlock: () => null, emergencyLeftToday: () => 1 }, '2026-11-16')).toEqual([]);
    expect(obeyedPosture({ posture: 'sealed', grace: true } as PostureState)).toBe('metered');
  });
});
