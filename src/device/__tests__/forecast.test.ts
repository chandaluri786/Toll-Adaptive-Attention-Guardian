// OWNER: A (tasks A11, A13). Every number and sentence on the Forecast tab.
import type { DaySummary } from '../../contracts';
import {
  calendarRows,
  completionRate,
  dayIcon,
  forecastModel,
  goalsSentence,
  historyNeeded,
  monthName,
  questsByCategory,
  summarizeRange,
  trendSentence,
  weekdayLetter,
  weekdayName,
} from '../forecast';

const day = (date: string, over: Partial<DaySummary> = {}): DaySummary => ({
  date,
  restrictedMin: 100,
  pastFreeMin: 0,
  stormMin: 0,
  questOpenedMin: 0,
  earned: 0,
  spent: 0,
  tasksPlanned: null,
  tasksDone: 0,
  questsByCategory: {},
  emergencyUnlocks: [],
  ...over,
});

/** `n` consecutive days ending 2026-11-15, oldest first. */
const run = (n: number, f: (i: number) => Partial<DaySummary> = () => ({})): DaySummary[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 10, 15 - (n - 1 - i), 12);
    return day(d.toISOString().slice(0, 10), f(i));
  });

describe('dayIcon — the design legend', () => {
  it('sun: within free time and a quest', () => {
    expect(dayIcon(day('2026-11-01', { questsByCategory: { fitness: 1 } }))).toBe('sun');
  });
  it('partly cloudy: only one of the two', () => {
    expect(dayIcon(day('2026-11-01'))).toBe('partly'); // within free time, no quest
    expect(dayIcon(day('2026-11-01', { pastFreeMin: 40, questsByCategory: { focus: 2 } }))).toBe('partly');
  });
  it('storm: neither', () => {
    expect(dayIcon(day('2026-11-01', { pastFreeMin: 40 }))).toBe('storm');
  });
});

describe('summarizeRange', () => {
  it('adds up the totals and averages distracting minutes', () => {
    const s = summarizeRange([
      day('2026-11-01', { restrictedMin: 60, earned: 25, spent: 10, tasksPlanned: 4, tasksDone: 3, emergencyUnlocks: [1] }),
      day('2026-11-02', { restrictedMin: 141, earned: 15, spent: 20, tasksPlanned: null, tasksDone: 2 }),
    ]);
    expect(s).toMatchObject({ days: 2, avgRestrictedMin: 101, earned: 40, spent: 30, tasksPlanned: 4, tasksDone: 5, daysWithPlan: 1, emergencyCount: 1 });
  });
  it('handles no days without dividing by zero', () => {
    expect(summarizeRange([]).avgRestrictedMin).toBe(0);
  });
});

describe('questsByCategory', () => {
  it('totals per type, biggest first, no zeros', () => {
    const out = questsByCategory([
      day('a', { questsByCategory: { fitness: 1, focus: 3, meetup: 0 } }),
      day('b', { questsByCategory: { fitness: 1 } }),
    ]);
    expect(out).toEqual([['focus', 3], ['fitness', 2]]);
  });
});

describe('trendSentence', () => {
  it('less scrolling', () => expect(trendSentence('month', 88, 100)).toBe('12 minutes less scrolling a day than last month.'));
  it('more scrolling, kindly', () => expect(trendSentence('week', 110, 100)).toBe('10 minutes more scrolling a day than last week. It happens.'));
  it('about the same', () => expect(trendSentence('week', 101, 100)).toBe('About the same distracting time a day as last week.'));
  it('no earlier period yet', () => expect(trendSentence('week', 90, null)).toBe('Not enough days yet to compare.'));
});

describe('calendarRows', () => {
  it('lines days up under Mon–Sun with blanks before the first day', () => {
    // 2026-11-04 is a Wednesday, so two blanks come first.
    const rows = calendarRows([day('2026-11-04'), day('2026-11-05'), day('2026-11-06')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((c) => c?.date ?? null)).toEqual([null, null, '2026-11-04', '2026-11-05', '2026-11-06', null, null]);
  });
  it('is empty for no days', () => expect(calendarRows([])).toEqual([]));
  it('weekday letters', () => expect(weekdayLetter('2026-11-15')).toBe('S')); // a Sunday
});

describe('goals', () => {
  it('completion is done / planned over days that had a plan, capped at the plan', () => {
    expect(completionRate([day('a', { tasksPlanned: 4, tasksDone: 3 }), day('b', { tasksPlanned: 6, tasksDone: 9 }), day('c', { tasksPlanned: null, tasksDone: 5 })])).toBe(90); // (3+6)/(4+6)
  });
  it('is null when no day had a plan', () => {
    expect(completionRate([day('a'), day('b')])).toBeNull();
  });
  it('the design sentence, up and down', () => {
    expect(goalsSentence(70, 58)).toBe('You finished 70% of what you planned, up from 58%.');
    expect(goalsSentence(60, 75)).toBe('You finished 60% of what you planned, down from 75%.');
    expect(goalsSentence(70, 71)).toBe('You finished 70% of what you planned.');
    expect(goalsSentence(70, null)).toBe('You finished 70% of what you planned.');
    expect(goalsSentence(null, 50)).toBe('No plans in this range. Quests you finished still count.');
  });
});

describe('names', () => {
  it('month and weekday names', () => {
    expect(monthName('2026-06-12')).toBe('June');
    expect(weekdayName('2026-11-17')).toBe('Tuesday');
  });
});

describe('forecastModel', () => {
  it('empty: the design copy, naming the day to check back', () => {
    // one day so far (Saturday 14 Nov): the forecast appears three days later, on Tuesday
    expect(forecastModel('week', [day('2026-11-14')])).toMatchObject({
      state: 'empty',
      title: 'Your forecast appears after a few days.',
      message: 'One day so far. Check back on Tuesday for your first week.',
    });
    expect(forecastModel('week', [])).toMatchObject({ state: 'empty', message: 'No days yet.' });
    expect(forecastModel('week', [day('2026-11-14'), day('2026-11-15')])).toMatchObject({ message: expect.stringContaining('2 days so far.') });
  });

  it('week: sunny-days headline, goals sentence and bars, trend', () => {
    // older 7 days: 50% done, 120 min; recent 7 days: 75% done, 90 min; Thursday is a no-plan day
    const history = run(14, (i) =>
      i < 7
        ? { restrictedMin: 120, tasksPlanned: 4, tasksDone: 2 }
        : { restrictedMin: 90, tasksPlanned: i === 11 ? null : 4, tasksDone: i === 11 ? 1 : 3, questsByCategory: { fitness: 1 } },
    );
    const m = forecastModel('week', history);
    if (m.state !== 'ready') throw new Error('expected ready');
    expect(m.days).toHaveLength(7);
    expect(m.summary.avgRestrictedMin).toBe(90);
    expect(m.sunny).toEqual({ label: 'This week', headline: '7 sunny days this week.' });
    expect(m.goals.headline).toBe('You finished 75% of what you planned, up from 50%.');
    expect(m.goals.bars).toHaveLength(7);
    expect(m.goals.bars.filter((b) => !b.hasPlan)).toHaveLength(1);
    expect(m.trend).toBe('30 minutes less scrolling a day than last week.');
    expect(m.icons).toHaveLength(7);
  });

  it('a single sunny day is singular', () => {
    const m = forecastModel('week', run(7, (i) => (i === 3 ? { questsByCategory: { focus: 1 } } : { pastFreeMin: 30 })));
    if (m.state !== 'ready') throw new Error('expected ready');
    expect(m.sunny.headline).toBe('1 sunny day this week.');
  });

  it('month: "N sunny days out of 30."', () => {
    const m = forecastModel('month', run(60, () => ({ questsByCategory: { focus: 1 } })));
    if (m.state !== 'ready') throw new Error('expected ready');
    expect(m.days).toHaveLength(30);
    expect(m.sunny).toEqual({ label: 'This month', headline: '30 sunny days out of 30.' });
  });

  it('six months compares 90 days with the 90 before, using the 180 days the ledger keeps', () => {
    expect(historyNeeded('six_months')).toBe(180);
    const m = forecastModel('six_months', run(180));
    if (m.state !== 'ready') throw new Error('expected ready');
    expect(m.days).toHaveLength(90);
    expect(m.sunny.label).toMatch(/^Since [A-Z][a-z]+$/);
    expect(m.trend).toBe('About the same distracting time a day as the three months before.');
  });

  it('a new user with only a few days still gets the range, without a comparison', () => {
    const m = forecastModel('week', run(5));
    if (m.state !== 'ready') throw new Error('expected ready');
    expect(m.days).toHaveLength(5);
    expect(m.trend).toBe('Not enough days yet to compare.');
    expect(m.goals.headline).toBe('No plans in this range. Quests you finished still count.');
  });
});
