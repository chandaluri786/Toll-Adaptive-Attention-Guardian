import type { Quest, Services, Verdict } from '../../contracts';
import { createFakeDevice } from '../../device/fakes';
import { createFakeEngine } from '../../engine/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter } from '../../shared/emitter';
import { createFakeDay, planSheetRequests, sheetRequests } from '../fakes';
import { createMemoryKV } from '../kv';
import { createPlannerStore } from '../planner';
import { createRealDay } from '../real';
import { STORAGE_KEY as QUESTS_KEY } from '../quest-state';
import type { StepSource } from '../quests';

/** Local time on the Monday of the build weekend (Nov 16, 2026). */
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();

function setup(opts: { start?: number } = {}) {
  const services = {} as Services;
  const get = () => services;
  const engine = createFakeEngine();
  engine.debug.clock.setNow(opts.start ?? at(14));
  const ledger = createFakeLedger(get);
  const device = createFakeDevice(get);
  const kv = createMemoryKV();
  const stepFeed = createEmitter<number>();
  const steps: StepSource = { subscribe: jest.fn((fn: (n: number) => void) => stepFeed.on(fn)) };
  const factories = { store: jest.fn(() => createPlannerStore({ kv, now: () => get().clock.now() })), kv: jest.fn(() => kv), steps: jest.fn(() => steps) };
  const day = createRealDay(get, factories);
  Object.assign(services, engine.services, ledger.services, device.services, day.services);
  return { day, services, engine, ledger, kv, factories, steps };
}

const sorted = (o: object) => Object.keys(o).sort();

describe('createRealDay', () => {
  test('has the same shape as the fake day', () => {
    // Arrange
    const { day } = setup();
    const fake = createFakeDay(() => ({}) as Services);

    // Assert
    expect(sorted(day)).toEqual(sorted(fake));
    expect(sorted(day.services)).toEqual(sorted(fake.services));
    expect(sorted(day.services.planner)).toEqual(sorted(fake.services.planner));
    expect(sorted(day.services.quests)).toEqual(sorted(fake.services.quests));
    expect(sorted(day.debug)).toEqual(sorted(fake.debug));
  });

  test('builds nothing and never calls get() at construction time', () => {
    // Arrange
    const get = jest.fn(() => ({}) as Services);
    const deps = { store: jest.fn(), kv: jest.fn(), steps: jest.fn() };

    // Act
    createRealDay(get, deps);

    // Assert
    expect(get).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  test('builds the store once and starts watching steps on first use', () => {
    // Arrange
    const { day, factories, steps } = setup();

    // Act
    day.services.planner.planSet();
    day.services.quests.active();

    // Assert
    expect(factories.store).toHaveBeenCalledTimes(1);
    expect(factories.steps).toHaveBeenCalledTimes(1);
    expect(steps.subscribe).toHaveBeenCalledTimes(1);
  });

  test("seed('demo_2pm'): 5 tasks, 2 done, home set, Algorithms at 10:30 (S1)", () => {
    // Arrange
    const { day } = setup();

    // Act
    day.debug.seed('demo_2pm');

    // Assert
    const { planner } = day.services;
    expect(planner.planSet()).toBe(true);
    expect(planner.progress()).toEqual({ done: 2, total: 5 });
    expect(planner.home()).toEqual({ lat: 33.4242, lon: -111.9281 });
    const block = planner.currentBlock(at(10, 30));
    expect(block).toMatchObject({ type: 'class', title: 'Algorithms', start: at(10), end: at(11) });
    expect(planner.currentBlock(at(11, 30))).toBeNull();
    expect(planner.nextBlock(at(14))?.start).toBe(new Date(2026, 10, 17, 10).getTime());
  });

  test("seed('fresh') and seed('late_night') match the fake: the same 5-task plan", () => {
    // Arrange
    const { day } = setup();

    for (const s of ['fresh', 'late_night'] as const) {
      // Act
      day.debug.seed(s);

      // Assert
      expect(day.services.planner.progress()).toEqual({ done: 2, total: 5 });
      expect(day.services.planner.currentBlock(at(10, 30))?.title).toBe('Algorithms');
    }
  });

  test("seed('no_plan'): no plan, no block, morning reminder due (contract test)", () => {
    // Arrange
    const { day } = setup();
    day.debug.seed('demo_2pm');

    // Act
    day.debug.seed('no_plan');

    // Assert
    const { planner } = day.services;
    expect(planner.planSet()).toBe(false);
    expect(planner.progress()).toEqual({ done: 0, total: 0 });
    expect(planner.currentBlock(at(10, 30))).toBeNull();
    expect(planner.remindersDue(at(9))).toBe('morning');
  });

  test('reset clears only day: state back to defaults', () => {
    // Arrange
    const { day, kv } = setup();
    day.debug.seed('demo_2pm');
    day.debug.accept('place');

    // Act
    day.debug.reset();

    // Assert
    expect(day.services.planner.planSet()).toBe(false);
    expect(day.services.planner.home()).toBeNull();
    expect(day.services.quests.active()).toEqual([]);
    expect(kv.keys().every((k) => k.startsWith('day:'))).toBe(true);
    expect(JSON.parse(kv.getString(QUESTS_KEY)!).records).toEqual([]);
  });

  test('passActive credits the ledger, fires onVerified and ticks the next plan task', () => {
    // Arrange
    const { day, services } = setup();
    day.debug.seed('demo_2pm');
    const before = services.ledger.balance();
    const got: { q: Quest; v: Verdict; minted: number }[] = [];
    day.services.quests.onVerified((q, v, minted) => got.push({ q, v, minted }));

    // Act
    day.debug.passActive();

    // Assert
    expect(got).toHaveLength(1);
    expect(got[0].q).toMatchObject({ type: 'fitness', status: 'passed', taskId: 'seed-t3' });
    expect(got[0].v.pass).toBe(true);
    expect(got[0].minted).toBe(25);
    expect(services.ledger.balance()).toBe(before + 25);
    expect(day.services.planner.progress()).toEqual({ done: 3, total: 5 });
  });

  test('passActive in Storm opens a window at once (S3-style, after reset)', () => {
    // Arrange
    const { day, services, engine } = setup();
    day.debug.reset();
    engine.debug.postureSource.setPosture('sealed');
    const minted: number[] = [];
    day.services.quests.onVerified((_q, _v, m) => minted.push(m));

    // Act
    day.debug.passActive();

    // Assert
    expect(minted).toEqual([25]);
    expect(services.ledger.activeWindows().some((w) => w.source === 'quest')).toBe(true);
  });

  test('addSteps(2000) right after accepting fitness passes the quest', () => {
    // Arrange
    const { day } = setup();
    day.debug.seed('no_plan');
    const passed: Quest[] = [];
    day.services.quests.onVerified((q) => passed.push(q));
    const q = day.debug.accept('fitness');

    // Act
    day.debug.addSteps(2000);

    // Assert
    expect(passed.map((p) => p.id)).toEqual([q.id]);
    expect(day.services.quests.active()).toEqual([]);
  });

  test('openSheet and openPlanSheet use the shared emitters', () => {
    // Arrange
    const { day } = setup();
    const sheets: unknown[] = [];
    let planOpens = 0;
    const offA = sheetRequests.on((r) => sheets.push(r));
    const offB = planSheetRequests.on(() => (planOpens += 1));

    // Act
    day.services.quests.openSheet({ from: 'storm_screen', posture: 'sealed', pkg: 'com.example' });
    day.services.planner.openPlanSheet();
    offA();
    offB();

    // Assert
    expect(sheets).toEqual([{ from: 'storm_screen', posture: 'sealed', pkg: 'com.example' }]);
    expect(planOpens).toBe(1);
  });

  test('onChange fires when a seed changes the plan; setPlan(false) clears it', () => {
    // Arrange
    const { day } = setup();
    day.debug.seed('demo_2pm');
    const fn = jest.fn();
    day.services.planner.onChange(fn);

    // Act
    day.debug.setPlan(false);

    // Assert
    expect(fn).toHaveBeenCalled();
    expect(day.services.planner.planSet()).toBe(false);
  });
});
