import { createMemoryKV } from '../kv';
import { createPlanner, createPlannerStore, validateBlock, validateSleep, type PlannerStore } from '../planner';
import { dayKey, parseHHMM } from '../time';

/** Local time on the Monday of the build weekend (Nov 16, 2026). */
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 16 + dayOffset, h, m).getTime();
const weekday = (t: number) => new Date(t).getDay();

function setup(start = at(9)) {
  let now = start;
  const kv = createMemoryKV();
  const openPlanSheet = jest.fn();
  const store = createPlannerStore({ kv, now: () => now });
  const planner = createPlanner(store, { now: () => now, openPlanSheet });
  return { kv, store, planner, openPlanSheet, setNow: (t: number) => (now = t) };
}

const algorithms = (store: PlannerStore, days = [weekday(at(10))]) =>
  store.addBlock({ type: 'class', title: 'Algorithms', days, startMin: parseHHMM('10:00'), endMin: parseHHMM('11:00') });

describe('time helpers', () => {
  test('parseHHMM', () => {
    expect(parseHHMM('07:30')).toBe(450);
    expect(parseHHMM('23:00')).toBe(1380);
  });

  test('the day rolls over at 04:00, not midnight', () => {
    expect(dayKey(at(3, 59))).toBe('2026-11-15');
    expect(dayKey(at(4, 0))).toBe('2026-11-16');
  });
});

describe('validation', () => {
  test('blocks are capped at 4 hours', () => {
    expect(validateBlock({ type: 'deep_work', title: 'Thesis', days: [1], startMin: 600, endMin: 600 + 241 }, [])).toMatch(/4 hours/);
    expect(validateBlock({ type: 'deep_work', title: 'Thesis', days: [1], startMin: 600, endMin: 840 }, [])).toBeNull();
  });

  test('a block must end after it starts and have a day', () => {
    expect(validateBlock({ type: 'class', title: 'X', days: [1], startMin: 600, endMin: 600 }, [])).not.toBeNull();
    expect(validateBlock({ type: 'class', title: 'X', days: [], startMin: 600, endMin: 660 }, [])).not.toBeNull();
  });

  test('overlapping blocks on the same day are refused, other days are fine', () => {
    const existing = [{ id: 'a', type: 'class' as const, title: 'Algorithms', days: [1], startMin: 600, endMin: 660 }];
    expect(validateBlock({ type: 'meeting', title: 'Standup', days: [1], startMin: 630, endMin: 690 }, existing)).toMatch(/Algorithms/);
    expect(validateBlock({ type: 'meeting', title: 'Standup', days: [2], startMin: 630, endMin: 690 }, existing)).toBeNull();
  });

  test('sleep is capped at 10 hours and may cross midnight', () => {
    expect(validateSleep({ start: '23:00', end: '07:00' })).toBeNull();
    expect(validateSleep({ start: '21:00', end: '07:30' })).toMatch(/10 hours/);
    expect(validateSleep({ start: '25:00', end: '07:00' })).not.toBeNull();
  });
});

describe('Planner (B1)', () => {
  test('fresh install: no plan, no home, default sleep, no blocks', () => {
    const { planner } = setup();
    expect(planner.planSet()).toBe(false);
    expect(planner.progress()).toEqual({ done: 0, total: 0 });
    expect(planner.home()).toBeNull();
    expect(planner.sleepWindow()).toEqual({ start: '23:00', end: '07:00' });
    expect(planner.currentBlock(at(10, 30))).toBeNull();
    expect(planner.nextBlock(at(9))).toBeNull();
  });

  test('currentBlock and nextBlock come from the weekly timetable', () => {
    const { store, planner } = setup();
    expect(algorithms(store)).toEqual({ ok: true });
    expect(planner.nextBlock(at(9, 58))).toMatchObject({ type: 'class', title: 'Algorithms', start: at(10), end: at(11) });
    expect(planner.currentBlock(at(10, 30))).toMatchObject({ title: 'Algorithms', start: at(10), end: at(11) });
    expect(planner.currentBlock(at(11))).toBeNull();
    expect(planner.currentBlock(at(10, 30, 1))).toBeNull(); // not on Tuesday
  });

  test('nextBlock looks into tomorrow', () => {
    const { store, planner } = setup();
    algorithms(store, [weekday(at(10, 0, 1))]);
    expect(planner.nextBlock(at(22))).toMatchObject({ start: at(10, 0, 1) });
  });

  test('a refused block is not saved', () => {
    const { store, planner } = setup();
    const r = store.addBlock({ type: 'deep_work', title: 'Marathon', days: [weekday(at(9))], startMin: 540, endMin: 900 });
    expect(r.ok).toBe(false);
    expect(planner.currentBlock(at(10))).toBeNull();
  });

  test('home, sleep and blocks persist across restarts', () => {
    const { kv, store } = setup();
    store.setHome({ lat: 33.42, lon: -111.93 });
    store.setSleep({ start: '23:30', end: '07:30' });
    algorithms(store);
    const again = createPlanner(createPlannerStore({ kv, now: () => at(9) }), { now: () => at(9), openPlanSheet: jest.fn() });
    expect(again.home()).toEqual({ lat: 33.42, lon: -111.93 });
    expect(again.sleepWindow()).toEqual({ start: '23:30', end: '07:30' });
    expect(again.currentBlock(at(10, 30))).not.toBeNull();
  });

  test('storage is written under the day: prefix', () => {
    const { kv, store } = setup();
    store.setHome({ lat: 1, lon: 2 });
    expect(kv.keys().every((k) => k.startsWith('day:'))).toBe(true);
  });

  test('corrupt storage falls back to defaults instead of crashing', () => {
    const kv = createMemoryKV();
    kv.set('planner', '{not json');
    const store = createPlannerStore({ kv, now: () => at(9) });
    expect(store.getState().sleep).toEqual({ start: '23:00', end: '07:00' });
  });

  test('onChange fires on every change and can unsubscribe', () => {
    const { store, planner } = setup();
    const fn = jest.fn();
    const unsub = planner.onChange(fn);
    store.setHome({ lat: 1, lon: 2 });
    algorithms(store);
    unsub();
    store.clearHome();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('removing a block frees its slot', () => {
    const { store, planner } = setup();
    algorithms(store);
    const id = store.getState().blocks[0].id;
    store.removeBlock(id);
    expect(planner.currentBlock(at(10, 30))).toBeNull();
  });

  test('state updates never mutate the previous snapshot', () => {
    const { store } = setup();
    const before = store.getState();
    algorithms(store);
    expect(before.blocks).toHaveLength(0);
    expect(store.getState()).not.toBe(before);
  });

  test('openPlanSheet asks the sheet to open', () => {
    const { planner, openPlanSheet } = setup();
    planner.openPlanSheet();
    expect(openPlanSheet).toHaveBeenCalled();
  });

  test('standing goals default to the six task types and can be replaced', () => {
    const { store } = setup();
    expect(store.getState().goals.map((g) => g.type).sort()).toEqual(
      ['coding', 'fitness', 'focus', 'meetup', 'place', 'study'],
    );
    store.setGoals([{ type: 'fitness', label: '10,000 steps a day', target: 10_000 }]);
    expect(store.getState().goals).toHaveLength(1);
  });
});
