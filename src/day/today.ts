// OWNER: B (task B9). Today's view model, pure (docs/design 2.1–2.5): weather word, reason and
// next change; umbrella time as the hero (with the umbrella-up countdown, 2.4); the free-time
// meter; today's tasks with live progress or Verify, or "No plan today — that's fine"; one
// suggested quest.
import type { AccessWindow, Block, Posture, PostureState, TaskType } from '../contracts';
import { weatherFor } from '../ui/weather';
import { clockTime, formatHoursMin, formatMinSec } from './format';
import type { PlanTask } from './planner';
import { payFor, QUEST_COPY } from './quest-copy';
import { questTypesForTask } from './quest-rules';
import { readout, UMBRELLA_BAR_MIN } from './quest-sheet';
import type { LiveReadout, Offer } from './quests';
import { TASK_LABELS } from './plan';

/** Free time each day ("120 at 04:00" in the contract). */
export const FREE_MIN_PER_DAY = 120;
const BLOCK_MATCH_MS = 60_000;

export type TodayInput = {
  state: PostureState;
  balance: number;
  now: number;
  /** Today's earned/spent minutes, when the ledger's history has today. */
  earnedSpent: { earned: number; spent: number } | null;
  windows: AccessWindow[];
  /** The timetable block starting at the next change, for "Clouds at 10:00 — Algorithms". */
  blockAt: (at: number) => Block | null;
  progress: { done: number; total: number };
  /** Today's plan tasks (real day module), or null where only counts are known (fakes). */
  tasks: PlanTask[] | null;
  /** Live readout of a running quest per plan task. */
  liveByTask: Record<string, { type: TaskType; live: LiveReadout; target: number }>;
  suggestion: Offer | null;
  /** B10: a quiz is ready for this study task (else it verifies by focus). */
  quizReady?: (taskId?: string) => boolean;
};

export type TaskStatus =
  | { kind: 'done'; label: string }
  | { kind: 'live'; label: string }
  | { kind: 'verify'; questType: TaskType }
  | { kind: 'later'; label: string };
export type TaskRow = { id: string; type: TaskType; title: string; meta: string; status: TaskStatus };

export type TodayView = {
  chip: string;
  weatherName: string;
  reason: string;
  nextLine: string | null;
  umbrella: { minutes: number; fraction: number; line: string | null; up: string | null };
  free: { headline: string; fraction: number; resets: string };
  tasks: { kind: 'none' } | { kind: 'plan'; count: string; rows: TaskRow[] };
  suggested: { title: string; pays: string; type: TaskType; taskId?: string } | null;
};

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** "Clouds at 10:00 — Algorithms", "Next change: clears at 14:00", or "Clear while free time lasts". */
export function nextChangeLine(posture: Posture, next: PostureState['nextChange'], blockAt: TodayInput['blockAt']): string | null {
  if (!next) return posture === 'open' ? 'Clear while free time lasts' : null;
  const time = clockTime(next.at);
  if (next.to === 'open') return `Next change: clears at ${time}`;
  const block = blockAt(next.at);
  const suffix = block && Math.abs(block.start - next.at) < BLOCK_MATCH_MS ? ` — ${block.title}` : '';
  if (posture === 'open') return `Clouds at ${time}${suffix}`;
  return next.to === 'sealed' ? `Next change: Storm at ${time}${suffix}` : `Next change: clouds at ${time}`;
}

/** The umbrella card (2.1–2.5) and its countdown while an access window is open (2.4). */
export function umbrellaCard(balance: number, earnedSpent: TodayInput['earnedSpent'], windows: AccessWindow[], now: number): TodayView['umbrella'] {
  const open = windows.filter((w) => w.until > now);
  const until = open.length > 0 ? Math.max(...open.map((w) => w.until)) : null;
  const earned = earnedSpent?.earned ?? 0;
  const line = earned > 0 ? `Earned ${earned} today · spent ${earnedSpent!.spent}` : balance === 0 ? 'Finish a quest to earn some' : null;
  return { minutes: balance, fraction: clamp01(balance / UMBRELLA_BAR_MIN), line, up: until !== null ? `${formatMinSec(until - now)} left` : null };
}

export function freeTimeMeter(allowanceLeftMin: number): TodayView['free'] {
  const left = Math.max(0, Math.floor(allowanceLeftMin));
  const headline = left > 0 ? `${formatHoursMin(left)} of free time left` : "Free time's up — the forecast is live";
  return { headline, fraction: clamp01(left / FREE_MIN_PER_DAY), resets: 'Resets 04:00' };
}

/** The quest that verifies a task here: study takes the quiz once its questions are in. */
const taskQuestType = (task: PlanTask, input: TodayInput) => questTypesForTask(task, { quizReady: input.quizReady })[0] ?? null;

function taskStatus(task: PlanTask, live: TodayInput['liveByTask'][string] | undefined, questType: TaskType | null): TaskStatus {
  if (task.done >= 1) return { kind: 'done', label: 'Done' };
  if (task.done > 0) return { kind: 'done', label: 'Half done' };
  if (live) {
    const r = readout(live.type, live.live, live.target);
    return { kind: 'live', label: `${r.big} ${r.sub}` };
  }
  return questType ? { kind: 'verify', questType } : { kind: 'later', label: 'Checks arrive soon' };
}

function taskRows(input: TodayInput): TodayView['tasks'] {
  const { done, total } = input.progress;
  if (total === 0) return { kind: 'none' };
  const rows = (input.tasks ?? []).map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    meta: `${TASK_LABELS[t.type]} · pays ${payFor(taskQuestType(t, input) ?? t.type, t.rate)} min`,
    status: taskStatus(t, input.liveByTask[t.id], taskQuestType(t, input)),
  }));
  return { kind: 'plan', count: `${done} of ${total} done`, rows };
}

export function todayView(input: TodayInput): TodayView {
  const w = weatherFor(input.state.posture);
  const s = input.suggestion;
  return {
    chip: w.word,
    weatherName: w.name,
    reason: input.state.reason,
    nextLine: nextChangeLine(input.state.posture, input.state.nextChange, input.blockAt),
    umbrella: umbrellaCard(input.balance, input.earnedSpent, input.windows, input.now),
    free: freeTimeMeter(input.state.allowanceLeftMin),
    tasks: taskRows(input),
    suggested: s
      ? { title: s.taskId ? s.title : QUEST_COPY[s.type].offerTitle, pays: `Pays ${payFor(s.type)} min`, type: s.type, ...(s.taskId ? { taskId: s.taskId } : {}) }
      : null,
  };
}

/** Today's earned/spent from the ledger's daily history (the fake's numbers are made up). */
export function todaysTotals(history: { date: string; earned: number; spent: number }[], now: number): TodayInput['earnedSpent'] {
  const d = new Date(now);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = history.find((h) => h.date === key);
  return today ? { earned: today.earned, spent: today.spent } : null;
}
