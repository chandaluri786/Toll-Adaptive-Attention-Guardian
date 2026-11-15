import type { AccessWindow, Block, PostureState } from '../../contracts';
import { MIN } from '../../shared/emitter';
import type { PlanTask } from '../planner';
import { freeTimeMeter, nextChangeLine, todaysTotals, todayView, umbrellaCard, type TodayInput } from '../today';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const NO_LIVE = { steps: 0, awayMin: 0, distanceM: null, offMs: 0 };
const ALGORITHMS: Block = { type: 'class', title: 'Algorithms', start: at(10), end: at(11) };
const blockAt = (t: number) => (t === ALGORITHMS.start ? ALGORITHMS : null);

const clear: PostureState = {
  posture: 'open',
  score: 10,
  reason: "Sky's clear. Enjoy it.",
  reasonCode: 'none',
  nextChange: { at: at(10), to: 'sealed' },
  grace: false,
  allowanceLeftMin: 72,
  computedAt: at(9, 41),
};

const task = (id: string, patch: Partial<PlanTask> = {}): PlanTask => ({ id, type: 'fitness', title: 'Walk to campus', addedAt: at(8), rate: 1, done: 0, ...patch });

function input(patch: Partial<TodayInput> = {}): TodayInput {
  return {
    state: clear,
    balance: 18,
    now: at(9, 41),
    earnedSpent: { earned: 43, spent: 25 },
    windows: [],
    blockAt,
    progress: { done: 1, total: 4 },
    tasks: null,
    liveByTask: {},
    suggestion: null,
    ...patch,
  };
}

describe('weather header', () => {
  test('2.1 Clear with a plan: weather word, reason and the next block', () => {
    // Act
    const v = todayView(input());
    // Assert
    expect(v).toMatchObject({ chip: 'Clear', weatherName: 'Clear skies', reason: "Sky's clear. Enjoy it.", nextLine: 'Clouds at 10:00 — Algorithms' });
  });

  test('2.2/2.3 Cloudy or Storm clearing later', () => {
    // Act / Assert
    expect(nextChangeLine('metered', { at: at(14), to: 'open' }, blockAt)).toBe('Next change: clears at 14:00');
    expect(nextChangeLine('sealed', { at: at(11), to: 'open' }, blockAt)).toBe('Next change: clears at 11:00');
  });

  test('2.5 Clear with nothing ahead: clear while free time lasts', () => {
    // Act / Assert
    expect(nextChangeLine('open', null, blockAt)).toBe('Clear while free time lasts');
    expect(nextChangeLine('metered', null, blockAt)).toBeNull();
  });

  test('Cloudy turning to Storm at a block names it', () => {
    // Act / Assert
    expect(nextChangeLine('metered', { at: at(10), to: 'sealed' }, blockAt)).toBe('Next change: Storm at 10:00 — Algorithms');
  });
});

describe('umbrella time', () => {
  test('hero number, bar, earned and spent today', () => {
    // Act
    const u = umbrellaCard(18, { earned: 43, spent: 25 }, [], at(13));
    // Assert
    expect(u).toEqual({ minutes: 18, fraction: 18 / 60, line: 'Earned 43 today · spent 25', up: null });
  });

  test('2.5 nothing earned yet', () => {
    // Act / Assert
    expect(umbrellaCard(0, null, [], at(9)).line).toBe('Finish a quest to earn some');
  });

  test('2.4 umbrella up: countdown to the latest open window', () => {
    // Arrange
    const windows: AccessWindow[] = [
      { id: 'a', scope: 'restricted', until: at(13, 7) + 12 * MIN + 33_000, source: 'spend' },
      { id: 'b', scope: 'restricted', until: at(13, 0), source: 'quest' },
    ];
    // Act
    const u = umbrellaCard(3, { earned: 43, spent: 40 }, windows, at(13, 7));
    // Assert
    expect(u.up).toBe('12:33 left');
  });
});

describe('free time', () => {
  test('time left and the meter', () => {
    // Act / Assert
    expect(freeTimeMeter(72)).toEqual({ headline: '1 h 12 m of free time left', fraction: 72 / 120, resets: 'Resets 04:00' });
  });

  test('whole hours drop the minutes', () => {
    // Act / Assert
    expect(freeTimeMeter(120).headline).toBe('2 h of free time left');
    expect(freeTimeMeter(40).headline).toBe('40 m of free time left');
  });

  test("2.2 free time's up", () => {
    // Act / Assert
    expect(freeTimeMeter(0)).toEqual({ headline: "Free time's up — the forecast is live", fraction: 0, resets: 'Resets 04:00' });
  });
});

describe("today's tasks", () => {
  test('2.5 no plan today', () => {
    // Act / Assert
    expect(todayView(input({ progress: { done: 0, total: 0 } })).tasks).toEqual({ kind: 'none' });
  });

  test('fakes: only the count is known', () => {
    // Act / Assert
    expect(todayView(input({ progress: { done: 2, total: 5 } })).tasks).toEqual({ kind: 'plan', count: '2 of 5 done', rows: [] });
  });

  test('rows show done, half, live progress, Verify, and coding as later', () => {
    // Arrange
    const tasks = [
      task('a', { done: 1 }),
      task('b', { done: 0.5, type: 'place', title: 'Library' }),
      task('c', { title: 'Walk home' }),
      task('d', { type: 'focus', title: 'Read', rate: 0.5 }),
      task('e', { type: 'coding', title: 'Ship PR' }),
    ];
    const liveByTask = { c: { type: 'fitness' as const, live: { ...NO_LIVE, steps: 1395 }, target: 2000 } };
    // Act
    const v = todayView(input({ tasks, liveByTask, progress: { done: 1.5, total: 5 } }));
    // Assert
    if (v.tasks.kind !== 'plan') throw new Error('expected a plan');
    expect(v.tasks.count).toBe('1.5 of 5 done');
    expect(v.tasks.rows.map((r) => r.status)).toEqual([
      { kind: 'done', label: 'Done' },
      { kind: 'done', label: 'Half done' },
      { kind: 'live', label: '1,395 of 2,000 steps' },
      { kind: 'verify', questType: 'focus' },
      { kind: 'later', label: 'Checks arrive soon' },
    ]);
    expect(v.tasks.rows[3].meta).toBe('Focus · pays 8 min');
  });

  test('a study task is verified by a focus quest until the quiz lands', () => {
    // Act
    const v = todayView(input({ tasks: [task('s', { type: 'study', title: 'Graphs', topic: 'BFS' })] }));
    // Assert
    if (v.tasks.kind !== 'plan') throw new Error('expected a plan');
    expect(v.tasks.rows[0].status).toEqual({ kind: 'verify', questType: 'focus' });
  });
});

describe('suggested quest', () => {
  test('a plan task keeps its title; a standing goal uses the quest title', () => {
    // Act
    const fromTask = todayView(input({ suggestion: { type: 'fitness', taskId: 't1', title: 'Walk to campus', target: 2000, estMin: 20 } })).suggested;
    const fromGoal = todayView(input({ suggestion: { type: 'focus', title: '25 minutes with the phone down', target: 25, estMin: 25 } })).suggested;
    // Assert
    expect(fromTask).toEqual({ title: 'Walk to campus', pays: 'Pays 25 min', type: 'fitness', taskId: 't1' });
    expect(fromGoal).toEqual({ title: 'Phone-down focus', pays: 'Pays 15 min', type: 'focus' });
  });

  test('none when nothing fits', () => {
    // Act / Assert
    expect(todayView(input()).suggested).toBeNull();
  });
});

test("today's totals come from the ledger history row for today", () => {
  // Arrange
  const history = [
    { date: '2026-11-15', earned: 10, spent: 5 },
    { date: '2026-11-16', earned: 43, spent: 25 },
  ];
  // Act / Assert
  expect(todaysTotals(history, at(13))).toEqual({ earned: 43, spent: 25 });
  expect(todaysTotals([], at(13))).toBeNull();
});
