// OWNER: A (Spec A, tasks A11 week view, A13 month / 6 months). Everything the Forecast tab shows,
// computed from `Ledger.history()` and nothing else. All of it stays on the phone.
//
// Pure functions, no React: the screen (screens/ForecastView.tsx) only draws the model built here, and
// the tests (__tests__/forecast.test.ts) check every number. Copy is calm and honest: no shaming, no
// streaks, no levels (planning doc, "Wellbeing guardrails").
import type { DaySummary, TaskType } from '../contracts';

export type Range = 'week' | 'month' | 'six_months';

export const RANGES: readonly { id: Range; label: string; days: number; compareLabel: string }[] = [
  { id: 'week', label: 'Week', days: 7, compareLabel: 'last week' },
  { id: 'month', label: 'Month', days: 30, compareLabel: 'last month' },
  { id: 'six_months', label: '6 months', days: 90, compareLabel: 'the three months before' },
];
// Note: "6 months" shows the last 90 days against the 90 before them, because the ledger keeps 180 days.

/** How many days of history a range needs: the range itself plus the period it is compared with. */
export const historyNeeded = (r: Range) => RANGES.find((x) => x.id === r)!.days * 2;

/** The calendar icon for one day (matches the design legend). */
export type DayIcon = 'sun' | 'partly' | 'storm';

/**
 * Sun: stayed within free time AND finished at least one quest. Partly cloudy: one of the two.
 * Storm: neither. A day is never called "bad"; the icon only describes the weather it was.
 */
export function dayIcon(d: DaySummary): DayIcon {
  const withinFreeTime = d.pastFreeMin === 0;
  const finishedQuest = Object.values(d.questsByCategory).some((n) => (n ?? 0) > 0);
  return withinFreeTime && finishedQuest ? 'sun' : withinFreeTime || finishedQuest ? 'partly' : 'storm';
}

export type RangeSummary = {
  days: number;
  avgRestrictedMin: number;
  pastFreeTotal: number;
  stormTotal: number;
  questOpenedTotal: number;
  earned: number;
  spent: number;
  emergencyCount: number;
  tasksPlanned: number; // only days that had a plan
  tasksDone: number; // every day
  daysWithPlan: number;
  sunnyDays: number;
};

export function summarizeRange(days: readonly DaySummary[]): RangeSummary {
  const sum = (f: (d: DaySummary) => number) => days.reduce((a, d) => a + f(d), 0);
  return {
    days: days.length,
    avgRestrictedMin: days.length ? Math.round(sum((d) => d.restrictedMin) / days.length) : 0,
    pastFreeTotal: sum((d) => d.pastFreeMin),
    stormTotal: sum((d) => d.stormMin),
    questOpenedTotal: sum((d) => d.questOpenedMin),
    earned: sum((d) => d.earned),
    spent: sum((d) => d.spent),
    emergencyCount: sum((d) => d.emergencyUnlocks.length),
    tasksPlanned: sum((d) => d.tasksPlanned ?? 0),
    tasksDone: sum((d) => d.tasksDone),
    daysWithPlan: days.filter((d) => d.tasksPlanned !== null).length,
    sunnyDays: days.filter((d) => dayIcon(d) === 'sun').length,
  };
}

/** Quests finished per category, biggest first, zeros omitted. */
export function questsByCategory(days: readonly DaySummary[]): [TaskType, number][] {
  const totals = new Map<TaskType, number>();
  for (const d of days) {
    for (const [type, n] of Object.entries(d.questsByCategory) as [TaskType, number][]) {
      totals.set(type, (totals.get(type) ?? 0) + (n ?? 0));
    }
  }
  return [...totals.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
}

/** Plain-words trend, in the design's voice. Compares average distracting minutes a day. */
export function trendSentence(range: Range, recentAvg: number, previousAvg: number | null): string {
  const label = RANGES.find((r) => r.id === range)!.compareLabel;
  if (previousAvg === null) return 'Not enough days yet to compare.';
  const diff = Math.round(recentAvg - previousAvg);
  if (Math.abs(diff) < 3) return `About the same distracting time a day as ${label}.`;
  return diff < 0
    ? `${-diff} minutes less scrolling a day than ${label}.`
    : `${diff} minutes more scrolling a day than ${label}. It happens.`;
}

/** Rows of 7 (Mon–Sun) for a calendar grid; leading/trailing blanks are null. Input is oldest first. */
export function calendarRows(days: readonly DaySummary[]): (DaySummary | null)[][] {
  if (days.length === 0) return [];
  const firstWeekday = (new Date(`${days[0].date}T12:00:00`).getDay() + 6) % 7; // Monday = 0
  const cells: (DaySummary | null)[] = [...Array<null>(firstWeekday).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const weekdayLetter = (date: string) => 'SMTWTFS'[new Date(`${date}T12:00:00`).getDay()];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const at = (date: string) => new Date(`${date}T12:00:00`);
export const monthName = (date: string) => MONTHS[at(date).getMonth()];
export const weekdayName = (date: string) => WEEKDAYS[at(date).getDay()];

/** Share of planned tasks that were finished, over the days that HAD a plan (null when none did). */
export function completionRate(days: readonly DaySummary[]): number | null {
  const planned = days.filter((d) => d.tasksPlanned !== null && d.tasksPlanned > 0);
  const total = planned.reduce((a, d) => a + (d.tasksPlanned ?? 0), 0);
  if (total === 0) return null;
  const done = planned.reduce((a, d) => a + Math.min(d.tasksDone, d.tasksPlanned ?? 0), 0);
  return Math.round((done / total) * 100);
}

/** "You finished 70% of what you planned, up from 58%." The design's sentence, honest in both directions. */
export function goalsSentence(now: number | null, before: number | null): string {
  if (now === null) return 'No plans in this range. Quests you finished still count.';
  const base = `You finished ${now}% of what you planned`;
  if (before === null || Math.abs(now - before) < 2) return `${base}.`;
  return `${base}, ${now > before ? 'up' : 'down'} from ${before}%.`;
}

/** One bar in the goals chart: a day's planned tasks against the ones done. `hasPlan` false = hatched bar. */
export type GoalBar = { date: string; planned: number; done: number; hasPlan: boolean };

export type ForecastModel =
  | {
      state: 'empty';
      title: string;
      message: string;
      /** Days so far (0 to MIN_DAYS_FOR_FORECAST - 1), for the row of empty circles. */
      days: DaySummary[];
    }
  | {
      state: 'ready';
      range: Range;
      days: DaySummary[]; // the shown range, oldest first
      summary: RangeSummary;
      /** "This week" / "This month" / "Since June" and its sentence, e.g. "4 sunny days this week." */
      sunny: { label: string; headline: string };
      goals: { headline: string; bars: GoalBar[] };
      trend: string;
      categories: [TaskType, number][];
      icons: DayIcon[]; // one per shown day, same order
    };

/** Fewer than this many days of data and there is nothing honest to show yet. */
export const MIN_DAYS_FOR_FORECAST = 3;

const addDays = (date: string, n: number) => {
  const d = at(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Build everything the Forecast screen needs. `history` is `Ledger.history(historyNeeded(range))`,
 * oldest first; it may be shorter than asked for a new user.
 */
export function forecastModel(range: Range, history: readonly DaySummary[]): ForecastModel {
  if (history.length < MIN_DAYS_FOR_FORECAST) {
    const n = history.length;
    const last = history.at(-1);
    const so = n === 0 ? 'No days yet.' : n === 1 ? 'One day so far.' : `${n} days so far.`;
    return {
      state: 'empty',
      title: 'Your forecast appears after a few days.',
      message: last ? `${so} Check back on ${weekdayName(addDays(last.date, MIN_DAYS_FOR_FORECAST - n + 1))} for your first week.` : so,
      days: [...history],
    };
  }
  const n = RANGES.find((r) => r.id === range)!.days;
  const days = history.slice(-n);
  const previous = history.slice(-2 * n, -n);
  const hasPrevious = previous.length >= MIN_DAYS_FOR_FORECAST;
  const summary = summarizeRange(days);
  const sunnyWord = summary.sunnyDays === 1 ? 'sunny day' : 'sunny days';
  const sunny =
    range === 'week'
      ? { label: 'This week', headline: `${summary.sunnyDays} ${sunnyWord} this week.` }
      : range === 'month'
        ? { label: 'This month', headline: `${summary.sunnyDays} ${sunnyWord} out of ${days.length}.` }
        : { label: `Since ${monthName(days[0].date)}`, headline: `${summary.sunnyDays} ${sunnyWord} since ${monthName(days[0].date)}.` };

  return {
    state: 'ready',
    range,
    days,
    summary,
    sunny,
    goals: {
      headline: goalsSentence(completionRate(days), hasPrevious ? completionRate(previous) : null),
      bars: days.map((d) => ({ date: d.date, planned: d.tasksPlanned ?? 0, done: Math.min(d.tasksDone, d.tasksPlanned ?? d.tasksDone), hasPlan: d.tasksPlanned !== null })),
    },
    trend: trendSentence(range, summary.avgRestrictedMin, hasPrevious ? summarizeRange(previous).avgRestrictedMin : null),
    categories: questsByCategory(days),
    icons: days.map(dayIcon),
  };
}
