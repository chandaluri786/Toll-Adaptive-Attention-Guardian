import type { DeviceSignals, Posture, Quest, Services, Verdict } from '../../contracts';
import { createFakeDevice, HOME } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter, HOUR, MIN } from '../../shared/emitter';
import { createMemoryKV, type KV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { createQuestEngine, type StepSource } from '../quests';
import type { MeetupCode } from '../wordlist';

/** Local time on the Monday of the build weekend (Nov 16, 2026). */
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const CODE: MeetupCode = ['BEACH', 'TRUCK', 'ZEBRA'];

function createStepSource() {
  const listeners = createEmitter<number>();
  let sinceStart = 0;
  const source: StepSource = {
    subscribe(fn) {
      sinceStart = 0;
      return listeners.on(fn);
    },
  };
  /** Real steps from the pedometer: cumulative since the subscription started. */
  const walk = (n: number) => {
    sinceStart += n;
    listeners.emit(sinceStart);
  };
  return { source, walk, listeners };
}

function setup(opts: { start?: number; posture?: Posture; home?: boolean; kv?: KV } = {}) {
  let now = opts.start ?? at(14);
  let posture: Posture = opts.posture ?? 'open';
  const ticks = createEmitter<number>();
  const get = (() => ({
    clock: { now: () => now, onTick: (fn: (t: number) => void) => ticks.on(fn) },
    postureSource: { get: () => ({ posture }) },
  })) as unknown as () => Services;
  const kv = opts.kv ?? createMemoryKV();
  const store = createPlannerStore({ kv, now: () => now });
  if (opts.home !== false) store.setHome(HOME);
  const planActions = createPlanActions(store, { now: () => now });
  const ledger = createFakeLedger(get);
  const device = createFakeDevice(get);
  const steps = createStepSource();
  const fakeSignals = device.services.deviceSignals;
  const startLocation = jest.spyOn(fakeSignals, 'startLocation');
  const stopLocation = jest.spyOn(fakeSignals, 'stopLocation');
  // The device fake only emits screen-off pairs; tests also need single screen events.
  const screen = createEmitter<{ at: number; on: boolean }>();
  const signals: DeviceSignals = {
    onScreen(fn) {
      const offA = fakeSignals.onScreen(fn);
      const offB = screen.on(fn);
      return () => {
        offA();
        offB();
      };
    },
    onLocation: (fn) => fakeSignals.onLocation(fn),
    startLocation: () => fakeSignals.startLocation(),
    stopLocation: () => fakeSignals.stopLocation(),
  };
  const engine = createQuestEngine({
    now: () => now,
    kv,
    ledger: ledger.services.ledger,
    deviceSignals: signals,
    planner: store,
    planActions,
    steps: steps.source,
    onTick: (fn) => ticks.on(fn),
    meetupCode: () => CODE,
  });
  engine.start();
  const verified: { q: Quest; v: Verdict; minted: number }[] = [];
  engine.onVerified((q, v, minted) => verified.push({ q, v, minted }));
  return {
    engine,
    kv,
    store,
    planActions,
    ledger,
    device,
    steps,
    verified,
    startLocation,
    stopLocation,
    ticks,
    emitScreen: (e: { at: number; on: boolean }) => screen.emit(e),
    screenListeners: () => screen.size(),
    advance: (ms: number) => (now += ms),
    setNow: (t: number) => (now = t),
    setPosture: (p: Posture) => (posture = p),
    now: () => now,
  };
}

const accepted = (r: ReturnType<ReturnType<typeof createQuestEngine>['accept']>): Quest => {
  if (!r.ok) throw new Error(r.error);
  return r.quest;
};

describe('contract surface', () => {
  test('openSheet emits on the sheet request channel', () => {
    // Arrange
    const sheets = createEmitter<{ from: 'storm_screen' | 'today'; posture: Posture; pkg?: string }>();
    const seen = jest.fn();
    sheets.on(seen);
    const kv = createMemoryKV();
    const store = createPlannerStore({ kv, now: () => at(14) });
    const engine = createQuestEngine({
      now: () => at(14),
      kv,
      ledger: { credit: jest.fn() },
      deviceSignals: { onScreen: () => () => {}, onLocation: () => () => {}, startLocation() {}, stopLocation() {} },
      planner: store,
      planActions: createPlanActions(store, { now: () => at(14) }),
      steps: { subscribe: () => () => {} },
      sheetRequests: sheets,
    });
    // Act
    engine.openSheet({ from: 'storm_screen', posture: 'sealed', pkg: 'com.instagram.android' });
    // Assert
    expect(seen).toHaveBeenCalledWith({ from: 'storm_screen', posture: 'sealed', pkg: 'com.instagram.android' });
  });

  test('accept records a baseline and the quest shows in active()', () => {
    // Arrange
    const { engine, steps, now } = setup();
    steps.walk(300);
    // Act
    const q = accepted(engine.accept('fitness'));
    // Assert
    expect(q).toMatchObject({ type: 'fitness', target: 2000, acceptedAt: now(), expiresAt: now() + 4 * HOUR, status: 'active' });
    expect(q.baseline.steps).toBe(300);
    expect(engine.active().map((a) => a.id)).toEqual([q.id]);
  });
});

describe('steps quest', () => {
  test('S3: in a storm, addSteps(2000) passes and the credit opens a window at once', () => {
    // Arrange
    const { engine, ledger, verified } = setup({ posture: 'sealed' });
    const q = accepted(engine.accept('fitness'));
    // Act
    engine.debug.addSteps(2000);
    // Assert
    expect(verified).toHaveLength(1);
    expect(verified[0].q).toMatchObject({ id: q.id, status: 'passed' });
    expect(verified[0].v).toMatchObject({ pass: true, method: 'step_delta' });
    expect(verified[0].minted).toBe(25);
    expect(ledger.services.ledger.activeWindows()).toHaveLength(1);
    expect(ledger.services.ledger.balance()).toBe(30);
    expect(engine.active()).toEqual([]);
  });

  test('real pedometer steps auto-verify once 2,000 are walked over 5+ minutes', () => {
    // Arrange
    const { engine, steps, advance, verified, ledger } = setup();
    accepted(engine.accept('fitness'));
    // Act
    advance(10 * MIN);
    steps.walk(1500);
    const afterFirst = verified.length;
    advance(10 * MIN);
    steps.walk(600);
    // Assert
    expect(afterFirst).toBe(0);
    expect(verified).toHaveLength(1);
    expect(ledger.services.ledger.balance()).toBe(55);
  });

  test('a miss gives a plain reason and asks to wait 5 min before the next check', () => {
    // Arrange
    const { engine, steps, advance } = setup();
    const q = accepted(engine.accept('fitness'));
    advance(10 * MIN);
    steps.walk(620);
    // Act
    const first = engine.verify(q.id);
    const tooSoon = engine.verify(q.id);
    advance(5 * MIN);
    const later = engine.verify(q.id);
    // Assert
    expect(first).toMatchObject({ kind: 'missed', verdict: { measured: '620 of 2,000' } });
    if (first.kind !== 'missed') throw new Error('expected a miss');
    expect(first.retryAt).toBe(q.acceptedAt + 15 * MIN);
    expect(first.verdict.reason).not.toMatch(/fail|block/i);
    expect(tooSoon).toMatchObject({ kind: 'wait' });
    expect(later).toMatchObject({ kind: 'missed' });
  });

  test('implausible pace is flagged and lowers the rate, but still passes', () => {
    // Arrange
    const { engine, steps, advance, verified } = setup();
    accepted(engine.accept('fitness'));
    // Act
    advance(6 * MIN);
    steps.walk(2000);
    // Assert
    expect(verified[0].v.flags).toEqual(['implausible_pace']);
    expect(verified[0].minted).toBe(19); // 25 × 0.75
  });

  test('no fitness quest once the 7,000-step daily target is met', () => {
    // Arrange
    const { engine, steps } = setup({ start: at(9) });
    steps.walk(7000);
    // Act
    const offer = engine.suggest();
    const r = engine.accept('fitness');
    // Assert
    expect(offer?.type).not.toBe('fitness');
    expect(r).toMatchObject({ ok: false });
  });

  test('stepping over 04:00 starts a fresh daily count', () => {
    // Arrange
    const { engine, steps, setNow } = setup({ start: at(20) });
    steps.walk(7000);
    // Act
    setNow(at(20) + 12 * HOUR); // 08:00 next day
    // Assert
    expect(engine.stepsToday()).toBe(0);
    expect(engine.suggest()?.type).toBe('fitness');
  });
});

describe('focus quest (screen off)', () => {
  test('25 minutes with the screen off passes and unsubscribes the screen', () => {
    // Arrange
    const { engine, device, verified, ledger, screenListeners } = setup();
    accepted(engine.accept('focus'));
    // Act
    device.debug.screenOffFor(25);
    // Assert
    expect(verified[0].v).toMatchObject({ pass: true, method: 'screen_off' });
    expect(ledger.services.ledger.balance()).toBe(45);
    expect(screenListeners()).toBe(0);
  });

  test('an off stretch still running passes on the clock tick', () => {
    // Arrange
    const { engine, verified, advance, ticks, now, emitScreen } = setup();
    const q = accepted(engine.accept('focus'));
    // Act
    emitScreen({ at: q.acceptedAt, on: false });
    advance(26 * MIN);
    ticks.emit(now());
    // Assert
    expect(verified).toHaveLength(1);
  });

  test('a screen-on resets the stretch', () => {
    // Arrange
    const { engine, verified, emitScreen } = setup();
    const q = accepted(engine.accept('focus'));
    // Act
    emitScreen({ at: q.acceptedAt, on: false });
    emitScreen({ at: q.acceptedAt + 20 * MIN, on: true });
    emitScreen({ at: q.acceptedAt + 21 * MIN, on: false });
    emitScreen({ at: q.acceptedAt + 41 * MIN, on: true });
    // Assert
    expect(verified).toHaveLength(0);
    expect(engine.progress(q.id)?.verdict?.measured).toBe('20 of 25 min');
  });
});

describe('place quest (away from home)', () => {
  test('starts location on accept, passes at 45 min away, then stops location', () => {
    // Arrange
    const { engine, device, steps, verified, startLocation, stopLocation } = setup();
    accepted(engine.accept('place'));
    // Act
    steps.walk(1500);
    device.debug.walkAway(600, 45);
    // Assert
    expect(startLocation).toHaveBeenCalledTimes(1);
    expect(verified[0].v).toMatchObject({ pass: true, method: 'away_minutes', flags: [] });
    expect(verified[0].minted).toBe(25);
    expect(stopLocation).toHaveBeenCalledTimes(1);
  });

  test('cross-signal: a place pass with flat steps is flagged at a lower rate, never refused', () => {
    // Arrange
    const { engine, device, steps, verified } = setup();
    steps.walk(10);
    accepted(engine.accept('place'));
    // Act
    device.debug.walkAway(600, 45);
    // Assert
    expect(verified[0].v.pass).toBe(true);
    expect(verified[0].v.flags).toContain('flat_steps');
    expect(verified[0].minted).toBe(19);
  });

  test('needs a home location', () => {
    // Arrange
    const { engine } = setup({ home: false });
    // Act
    const r = engine.accept('place');
    // Assert
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/home/i) });
  });
});

describe('meetup quest', () => {
  test('S4: wrong code gives a plain retry message, the right code passes', () => {
    // Arrange
    const { engine, device, verified } = setup();
    const q = accepted(engine.accept('meetup'));
    device.debug.walkAway(600, 1);
    // Act
    const wrong = engine.submitMeetupPhoto(q.id, 'HELLO THERE FRIEND');
    const right = engine.submitMeetupPhoto(q.id, 'BEACH TRUCK');
    // Assert
    expect(engine.progress(q.id)?.code).toEqual(CODE);
    expect(wrong).toMatchObject({ kind: 'missed', retryAt: null, verdict: { reason: "Couldn't read it — try larger letters" } });
    expect(right).toMatchObject({ kind: 'passed', verdict: { method: 'meetup_code' } });
    expect(verified).toHaveLength(1);
  });

  test('S4: a mocked location sample fails even with the right code', () => {
    // Arrange
    const { engine, device, verified } = setup();
    const q = accepted(engine.accept('meetup'));
    // Act
    device.debug.walkAway(600, 1, true);
    const r = engine.submitMeetupPhoto(q.id, 'BEACH TRUCK ZEBRA');
    // Assert
    expect(r.kind === 'missed' || r.kind === 'wait').toBe(true);
    if (r.kind === 'missed' || r.kind === 'wait') expect(r.verdict.flags).toContain('mocked_location');
    expect(verified).toHaveLength(0);
  });

  test('a right code at home asks for 500 m', () => {
    // Arrange
    const { engine, device } = setup();
    const q = accepted(engine.accept('meetup'));
    device.debug.walkAway(100, 1);
    // Act
    const r = engine.submitMeetupPhoto(q.id, 'BEACH TRUCK ZEBRA');
    // Assert
    expect(r).toMatchObject({ kind: 'missed', verdict: { reason: expect.stringMatching(/need 500 m/) } });
  });
});

describe('claim half', () => {
  test('after a miss, claiming half credits rate 0.5 as self_declared and counts half a task', () => {
    // Arrange
    const { engine, planActions, store, ledger, verified, advance } = setup({ start: at(9) });
    planActions.startPlan([{ type: 'fitness', title: 'Walk to campus' }]);
    const taskId = store.getState().plan!.tasks[0].id;
    const q = accepted(engine.accept('fitness', taskId));
    advance(10 * MIN);
    engine.verify(q.id);
    const credit = jest.spyOn(ledger.services.ledger, 'credit');
    // Act
    const r = engine.claimHalf(q.id);
    // Assert
    expect(r).toMatchObject({ kind: 'passed', verdict: { method: 'self_declared', pass: true } });
    expect(credit).toHaveBeenCalledWith({ category: 'fitness', questId: q.id, rate: 0.5 });
    expect(verified[0].minted).toBe(13);
    expect(store.getState().plan!.tasks[0].done).toBe(0.5);
  });

  test('is only offered after a miss', () => {
    // Arrange
    const { engine } = setup();
    const q = accepted(engine.accept('fitness'));
    // Act
    const r = engine.claimHalf(q.id);
    // Assert
    expect(r).toMatchObject({ kind: 'unavailable' });
    expect(engine.progress(q.id)?.canClaimHalf).toBe(false);
  });
});

describe('plan link', () => {
  test('a quest from a plan task ticks that task on pass', () => {
    // Arrange
    const { engine, planActions, store } = setup({ start: at(9) });
    planActions.startPlan([{ type: 'focus', title: 'Deep work' }, { type: 'fitness', title: 'Walk' }]);
    // Act
    const offer = engine.suggest();
    const q = accepted(engine.accept(offer!.type, offer!.taskId));
    engine.debug.passActive();
    // Assert
    expect(offer).toMatchObject({ type: 'focus', title: 'Deep work' });
    expect(q.taskId).toBe(store.getState().plan!.tasks[0].id);
    expect(store.getState().plan!.tasks[0].done).toBe(1);
  });

  test('a task added after the lock earns half', () => {
    // Arrange
    const { engine, planActions, store, advance, verified } = setup({ start: at(9) });
    planActions.startPlan([{ type: 'focus', title: 'Deep work' }]);
    advance(31 * MIN);
    planActions.addTask({ type: 'fitness', title: 'Late walk' });
    const late = store.getState().plan!.tasks[1];
    // Act
    accepted(engine.accept('fitness', late.id));
    engine.debug.addSteps(2000);
    // Assert
    expect(verified[0].minted).toBe(13);
    expect(store.getState().plan!.tasks[1].done).toBe(1);
  });

  test('study tasks get a focus quest until the quiz lands', () => {
    // Arrange
    const { engine, planActions } = setup({ start: at(9) });
    planActions.startPlan([{ type: 'study', title: 'Algorithms', topic: 'Dijkstra' }]);
    // Act
    const offer = engine.suggest();
    // Assert
    expect(offer).toMatchObject({ type: 'focus', title: 'Algorithms' });
  });

  test('a standing-goal quest leaves the plan alone', () => {
    // Arrange
    const { engine, planActions, store } = setup({ start: at(9) });
    planActions.startPlan([{ type: 'focus', title: 'Deep work' }]);
    // Act
    accepted(engine.accept('fitness'));
    engine.debug.addSteps(2000);
    // Assert
    expect(store.getState().plan!.tasks[0].done).toBe(0);
  });
});

describe('expiry and cooldown', () => {
  test('a quest expires silently after 4 h and stops location', () => {
    // Arrange
    const { engine, advance, ticks, now, verified, stopLocation, ledger } = setup();
    const q = accepted(engine.accept('place'));
    // Act
    advance(4 * HOUR);
    ticks.emit(now());
    // Assert
    expect(engine.active()).toEqual([]);
    expect(engine.progress(q.id)?.quest.status).toBe('expired');
    expect(verified).toHaveLength(0);
    expect(ledger.debug.events()).toHaveLength(0);
    expect(stopLocation).toHaveBeenCalledTimes(1);
  });

  test('the same type rests for 2 h after a pass', () => {
    // Arrange
    const { engine, advance } = setup({ start: at(9) });
    accepted(engine.accept('fitness'));
    engine.debug.addSteps(2000);
    // Act
    const tooSoon = engine.accept('fitness');
    const suggested = engine.suggest();
    advance(2 * HOUR);
    const later = engine.accept('fitness');
    // Assert
    expect(tooSoon).toMatchObject({ ok: false, error: expect.stringMatching(/11:00/) });
    expect(suggested?.type).not.toBe('fitness');
    expect(later.ok).toBe(true);
  });

  test('one quest of a type at a time', () => {
    // Arrange
    const { engine } = setup();
    accepted(engine.accept('focus'));
    // Act
    const r = engine.accept('focus');
    // Assert
    expect(r).toMatchObject({ ok: false });
  });
});

describe('suggest sized to the time of day', () => {
  test('with no plan, the first standing goal that fits', () => {
    // Arrange
    const { engine } = setup({ start: at(9) });
    // Act
    const offer = engine.suggest();
    // Assert
    expect(offer).toMatchObject({ type: 'fitness', target: 2000 });
    expect(offer?.taskId).toBeUndefined();
  });

  test('close to bedtime only an indoor quest that fits', () => {
    // Arrange
    const { engine } = setup({ start: at(22, 30) });
    // Act
    const offer = engine.suggest();
    // Assert
    expect(offer?.type).toBe('focus');
  });

  test('nothing inside the sleep window or when no quest fits', () => {
    // Arrange
    const { engine, setNow } = setup({ start: at(22, 45) });
    // Act
    const nearSleep = engine.suggest();
    setNow(at(2));
    const asleep = engine.suggest();
    // Assert
    expect(nearSleep).toBeNull();
    expect(asleep).toBeNull();
  });

  test('without a home, skips place and meetup', () => {
    // Arrange
    const { engine, steps } = setup({ start: at(9), home: false });
    steps.walk(7000);
    // Act
    const offer = engine.suggest();
    // Assert
    expect(offer?.type).toBe('focus');
  });
});

describe('persistence', () => {
  test('an active quest survives a restart and location restarts', () => {
    // Arrange
    const first = setup();
    const q = accepted(first.engine.accept('place'));
    first.engine.stop();
    // Act
    const second = setup({ kv: first.kv });
    // Assert
    expect(second.engine.active().map((a) => a.id)).toEqual([q.id]);
    expect(second.startLocation).toHaveBeenCalledTimes(1);
    expect(first.kv.keys().every((k) => k.startsWith('day:'))).toBe(true);
  });

  test('corrupt stored data falls back to an empty engine', () => {
    // Arrange
    const kv = createMemoryKV();
    kv.set('quests', '{"version":1,"records":[{"quest":{"id":5}}],"stepCounter":"x"}');
    // Act
    const { engine } = setup({ kv });
    // Assert
    expect(engine.active()).toEqual([]);
    expect(engine.stepsToday()).toBe(0);
  });

  test('stop() unsubscribes steps and stops location', () => {
    // Arrange
    const { engine, steps, stopLocation } = setup();
    accepted(engine.accept('place'));
    // Act
    engine.stop();
    // Assert
    expect(steps.listeners.size()).toBe(0);
    expect(stopLocation).toHaveBeenCalledTimes(1);
  });
});

describe('debug helpers', () => {
  test('passActive credits the first active quest', () => {
    // Arrange
    const { engine, verified } = setup();
    accepted(engine.accept('focus'));
    // Act
    engine.debug.passActive();
    // Assert
    expect(verified[0]).toMatchObject({ v: { pass: true, method: 'screen_off' }, minted: 15 });
  });

  test('passActive with nothing active accepts and passes a fitness quest', () => {
    // Arrange
    const { engine, verified } = setup();
    // Act
    engine.debug.passActive();
    // Assert
    expect(verified[0].q.type).toBe('fitness');
  });

  test('reset clears quests and cooldowns', () => {
    // Arrange
    const { engine, stopLocation } = setup();
    accepted(engine.accept('place'));
    engine.debug.passActive();
    // Act
    engine.debug.reset();
    // Assert
    expect(engine.active()).toEqual([]);
    expect(engine.accept('place').ok).toBe(true);
    expect(stopLocation).toHaveBeenCalled();
  });
});
