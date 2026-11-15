import { createMemoryKV } from '../kv';
import { createPlanActions, forecastLine, isDeclined, isLocked, yesterdaysUnfinished, type NewTask } from '../plan';
import { createPlanner, createPlannerStore } from '../planner';
import { parseHHMM } from '../time';

/** Local time on the Monday of the build weekend (Nov 16, 2026). */
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 16 + dayOffset, h, m).getTime();
const weekday = (t: number) => new Date(t).getDay();

function setup(start = at(9)) {
  let now = start;
  const kv = createMemoryKV();
  const store = createPlannerStore({ kv, now: () => now });
  const actions = createPlanActions(store, { now: () => now });
  const planner = createPlanner(store, { now: () => now, openPlanSheet: jest.fn() });
  return { kv, store, actions, planner, setNow: (t: number) => (now = t) };
}

const walk: NewTask = { type: 'fitness', title: 'Walk to campus' };
const algo: NewTask = { type: 'study', title: 'Algorithms review', topic: 'Dijkstra' };
const tasks = (n: number): NewTask[] => Array.from({ length: n }, (_, i) => ({ type: 'focus', title: `Focus ${i + 1}` }));

describe('starting the day', () => {
  test('starts today\'s plan with typed tasks at full rate', () => {
    // Arrange
    const { actions, planner, store } = setup();
    // Act
    const r = actions.startPlan([walk, algo]);
    // Assert
    expect(r).toEqual({ ok: true });
    expect(planner.planSet()).toBe(true);
    expect(planner.progress()).toEqual({ done: 0, total: 2 });
    const plan = store.getState().plan!;
    expect(plan.startedAt).toBe(at(9));
    expect(plan.tasks.map((t) => [t.type, t.rate, t.done])).toEqual([['fitness', 1, 0], ['study', 1, 0]]);
    expect(plan.tasks[1].topic).toBe('Dijkstra');
    expect(plan.tasks[0].topic).toBeUndefined();
  });

  test('needs 1 to 7 tasks', () => {
    const { actions, planner } = setup();
    expect(actions.startPlan([])).toMatchObject({ ok: false });
    expect(actions.startPlan(tasks(8))).toMatchObject({ ok: false, error: expect.stringMatching(/7/) });
    expect(planner.planSet()).toBe(false);
    expect(actions.startPlan(tasks(7))).toEqual({ ok: true });
  });

  test('every task needs a name and a known type; study needs a topic', () => {
    const { actions } = setup();
    expect(actions.startPlan([{ type: 'fitness', title: '   ' }])).toMatchObject({ ok: false });
    expect(actions.startPlan([{ type: 'gaming' as never, title: 'Play' }])).toMatchObject({ ok: false });
    expect(actions.startPlan([{ type: 'study', title: 'Read' }])).toMatchObject({ ok: false, error: expect.stringMatching(/topic/i) });
  });

  test('titles and topics are trimmed', () => {
    const { actions, store } = setup();
    actions.startPlan([{ type: 'study', title: '  Read ', topic: ' Graphs ' }]);
    expect(store.getState().plan!.tasks[0]).toMatchObject({ title: 'Read', topic: 'Graphs' });
  });

  test('a second start on the same day is refused', () => {
    const { actions } = setup();
    actions.startPlan([walk]);
    expect(actions.startPlan([algo])).toMatchObject({ ok: false });
  });

  test('starting the day clears an earlier "Not today"', () => {
    const { actions, store } = setup();
    actions.decline();
    actions.startPlan([walk]);
    expect(isDeclined(store.getState(), at(9))).toBe(false);
  });
});

describe('the 30-minute lock', () => {
  test('locks 30 minutes after Start', () => {
    const { actions, store } = setup();
    actions.startPlan([walk]);
    const plan = store.getState().plan!;
    expect(isLocked(plan, at(9, 29))).toBe(false);
    expect(isLocked(plan, at(9, 30))).toBe(true);
  });

  test('tasks added before the lock earn full; after it, half', () => {
    const { actions, store, setNow } = setup();
    actions.startPlan([walk]);
    setNow(at(9, 10));
    expect(actions.addTask({ type: 'place', title: 'Library' })).toEqual({ ok: true });
    setNow(at(10));
    expect(actions.addTask({ type: 'meetup', title: 'Coffee with Sam' })).toEqual({ ok: true });
    expect(store.getState().plan!.tasks.map((t) => t.rate)).toEqual([1, 1, 0.5]);
  });

  test('never more than 7 tasks', () => {
    const { actions } = setup();
    actions.startPlan(tasks(7));
    expect(actions.addTask(walk)).toMatchObject({ ok: false, error: expect.stringMatching(/7/) });
  });

  test('adding needs a started plan and a valid task', () => {
    const { actions } = setup();
    expect(actions.addTask(walk)).toMatchObject({ ok: false });
    actions.startPlan([walk]);
    expect(actions.addTask({ type: 'study', title: 'Read' })).toMatchObject({ ok: false });
  });

  test('tasks can be removed before the lock, not after', () => {
    const { actions, store, setNow } = setup();
    actions.startPlan([walk, algo]);
    const [first, second] = store.getState().plan!.tasks;
    expect(actions.removeTask(first.id)).toEqual({ ok: true });
    expect(store.getState().plan!.tasks.map((t) => t.id)).toEqual([second.id]);
    setNow(at(9, 31));
    actions.addTask(walk);
    expect(actions.removeTask(second.id)).toMatchObject({ ok: false });
    expect(store.getState().plan!.tasks).toHaveLength(2);
  });

  test('the last task cannot be removed', () => {
    const { actions, store } = setup();
    actions.startPlan([walk]);
    expect(actions.removeTask(store.getState().plan!.tasks[0].id)).toMatchObject({ ok: false });
  });
});

describe('marking tasks (for B3)', () => {
  test('verified counts 1, self-declared counts half', () => {
    const { actions, planner, store } = setup();
    actions.startPlan([walk, algo]);
    const [a, b] = store.getState().plan!.tasks;
    expect(actions.markTask(a.id, 1)).toEqual({ ok: true });
    expect(actions.markTask(b.id, 0.5)).toEqual({ ok: true });
    expect(planner.progress()).toEqual({ done: 1.5, total: 2 });
  });

  test('a half never downgrades a full tick', () => {
    const { actions, planner, store } = setup();
    actions.startPlan([walk]);
    const id = store.getState().plan!.tasks[0].id;
    actions.markTask(id, 1);
    actions.markTask(id, 0.5);
    expect(planner.progress().done).toBe(1);
  });

  test('unknown task or no plan today is refused', () => {
    const { actions } = setup();
    expect(actions.markTask('nope', 1)).toMatchObject({ ok: false });
    actions.startPlan([walk]);
    expect(actions.markTask('nope', 1)).toMatchObject({ ok: false });
  });

  test('updates never mutate the previous snapshot', () => {
    const { actions, store } = setup();
    actions.startPlan([walk]);
    const before = store.getState();
    actions.markTask(before.plan!.tasks[0].id, 1);
    expect(before.plan!.tasks[0].done).toBe(0);
  });
});

describe('"Not today" and yesterday\'s tasks', () => {
  test('decline is recorded for today only and persists', () => {
    const { actions, kv, store } = setup();
    actions.decline();
    expect(isDeclined(store.getState(), at(15))).toBe(true);
    expect(isDeclined(store.getState(), at(9, 0, 1))).toBe(false);
    const again = createPlannerStore({ kv, now: () => at(9) });
    expect(isDeclined(again.getState(), at(9))).toBe(true);
  });

  test('yesterday\'s unfinished tasks are offered next morning, not rolled over', () => {
    const { actions, store, planner, setNow } = setup();
    actions.startPlan([walk, algo, { type: 'coding', title: 'Ship PR' }]);
    const [a, b] = store.getState().plan!.tasks;
    actions.markTask(a.id, 1);
    actions.markTask(b.id, 0.5);
    setNow(at(8, 0, 1));
    expect(planner.planSet()).toBe(false);
    expect(yesterdaysUnfinished(store.getState(), at(8, 0, 1))).toEqual([
      { type: 'study', title: 'Algorithms review', topic: 'Dijkstra' },
      { type: 'coding', title: 'Ship PR' },
    ]);
  });

  test('nothing to offer on the same day or two days later', () => {
    const { actions, store } = setup();
    actions.startPlan([walk]);
    expect(yesterdaysUnfinished(store.getState(), at(15))).toEqual([]);
    expect(yesterdaysUnfinished(store.getState(), at(9, 0, 2))).toEqual([]);
  });
});

describe('remindersDue', () => {
  test('morning once after wake-up, then noon once, then nothing', () => {
    const { planner } = setup(at(6));
    expect(planner.remindersDue(at(6, 59))).toBeNull(); // still asleep (wake 07:00)
    expect(planner.remindersDue(at(7, 1))).toBe('morning');
    expect(planner.remindersDue(at(7, 2))).toBeNull();
    expect(planner.remindersDue(at(11, 59))).toBeNull();
    expect(planner.remindersDue(at(12, 0))).toBe('noon');
    expect(planner.remindersDue(at(12, 1))).toBeNull();
    expect(planner.remindersDue(at(14, 0))).toBeNull();
  });

  test('wake-up follows the sleep window', () => {
    const { planner, store } = setup(at(6));
    store.setSleep({ start: '00:30', end: '08:30' });
    expect(planner.remindersDue(at(8))).toBeNull();
    expect(planner.remindersDue(at(8, 30))).toBe('morning');
  });

  test('no noon reminder once a plan is set', () => {
    const { planner, actions, setNow } = setup(at(7, 5));
    expect(planner.remindersDue(at(7, 5))).toBe('morning');
    setNow(at(8));
    actions.startPlan([walk]);
    expect(planner.remindersDue(at(12, 5))).toBeNull();
  });

  test('"Not today" silences both reminders', () => {
    const { planner, actions } = setup(at(6));
    actions.decline();
    expect(planner.remindersDue(at(7, 30))).toBeNull();
    expect(planner.remindersDue(at(12, 30))).toBeNull();
  });

  test('a first tick after noon gets only the noon reminder; after 14:00 none', () => {
    const { planner } = setup(at(12, 30));
    expect(planner.remindersDue(at(12, 30))).toBe('noon');
    const late = setup(at(14, 30)).planner;
    expect(late.remindersDue(at(14, 30))).toBeNull();
  });

  test('sent reminders persist across restarts and reset the next day', () => {
    const { kv, planner } = setup(at(7, 30));
    expect(planner.remindersDue(at(7, 30))).toBe('morning');
    const again = createPlanner(createPlannerStore({ kv, now: () => at(7, 31) }), { now: () => at(7, 31), openPlanSheet: jest.fn() });
    expect(again.remindersDue(at(7, 31))).toBeNull();
    expect(again.remindersDue(at(7, 30, 1))).toBe('morning');
  });
});

describe('forecastLine', () => {
  test('lists today\'s blocks, or invites a timetable', () => {
    const { store } = setup();
    expect(forecastLine(store.getState(), at(8))).toBe('No timetable yet — add one for a smarter forecast');
    store.addBlock({ type: 'class', title: 'Algorithms', days: [weekday(at(10))], startMin: parseHHMM('10:00'), endMin: parseHHMM('11:00') });
    store.addBlock({ type: 'meeting', title: 'Standup', days: [weekday(at(10))], startMin: parseHHMM('14:00'), endMin: parseHHMM('14:30') });
    expect(forecastLine(store.getState(), at(8))).toBe('Storms possible during Algorithms 10:00–11:00 · Standup 14:00–14:30');
  });

  test('a timetable with nothing today says the sky looks clear', () => {
    const { store } = setup();
    store.addBlock({ type: 'class', title: 'Algorithms', days: [weekday(at(10, 0, 1))], startMin: 600, endMin: 660 });
    expect(forecastLine(store.getState(), at(8))).toBe('Nothing on your timetable today — clear skies ahead');
  });
});
