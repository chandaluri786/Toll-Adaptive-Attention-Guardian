// OWNER: B (Spec B — task B3). The quest engine's persisted state (under `day:quests`) and its
// validation. Stored data is never trusted: anything malformed is dropped on load.
import type { LocationSample, Quest, TaskType, Verdict } from '../contracts';
import { TASK_TYPES } from './plan';
import type { MeetupCode } from './wordlist';

export const STORAGE_KEY = 'quests';
const SCHEMA_VERSION = 1;
/** One location sample a minute for a 4-h quest, plus slack. */
export const MAX_SAMPLES = 260;
export const MAX_SCREEN_EVENTS = 500;
/** Ended quests kept so the sheet can show a result after a restart. */
const MAX_ENDED = 20;
const ENDED_KEEP_MS = 24 * 60 * 60_000;

export type ScreenEvent = { at: number; on: boolean };

export type QuestRecord = {
  quest: Quest;
  code: MeetupCode | null; // meetup only
  screen: ScreenEvent[]; // focus: events since accept
  locations: LocationSample[]; // place/meetup: samples since accept
  /** Walking time implied by debug `addSteps`, so a demo walk isn't rejected as too quick. */
  bonusWalkMin: number;
  lastVerdict: Verdict | null;
  retryAt: number | null;
  missed: boolean; // a miss happened: "Claim half" is on offer
  endedAt: number | null;
};

export type EngineState = {
  version: number;
  records: QuestRecord[];
  /** Monotonic step count since install; quest baselines are taken from it. */
  stepCounter: number;
  stepsToday: { day: string; count: number };
  /** When each type last passed, for the 2-h same-type cooldown. */
  lastPassed: Partial<Record<TaskType, number>>;
  seq: number;
};

export function emptyState(): EngineState {
  return { version: SCHEMA_VERSION, records: [], stepCounter: 0, stepsToday: { day: '', count: 0 }, lastPassed: {}, seq: 0 };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);
const STATUSES: Quest['status'][] = ['offered', 'active', 'passed', 'failed', 'expired'];

function isQuest(q: unknown): q is Quest {
  if (!isObj(q)) return false;
  return (
    typeof q.id === 'string' &&
    TASK_TYPES.includes(q.type as TaskType) &&
    (q.taskId === undefined || typeof q.taskId === 'string') &&
    isNum(q.target) &&
    isNum(q.acceptedAt) &&
    isNum(q.expiresAt) &&
    isObj(q.baseline) &&
    Object.values(q.baseline).every(isNum) &&
    STATUSES.includes(q.status as Quest['status'])
  );
}

const isSample = (s: unknown): s is LocationSample =>
  isObj(s) && isNum(s.at) && isNum(s.lat) && isNum(s.lon) && isNum(s.accuracyM) && typeof s.mocked === 'boolean';
const isScreen = (e: unknown): e is ScreenEvent => isObj(e) && isNum(e.at) && typeof e.on === 'boolean';
const isCode = (c: unknown): c is MeetupCode => Array.isArray(c) && c.length === 3 && c.every((w) => typeof w === 'string');
const isVerdict = (v: unknown): v is Verdict =>
  isObj(v) && typeof v.questId === 'string' && typeof v.pass === 'boolean' && typeof v.reason === 'string' && typeof v.measured === 'string' && Array.isArray(v.flags);

function loadRecord(raw: unknown): QuestRecord | null {
  if (!isObj(raw) || !isQuest(raw.quest)) return null;
  return {
    quest: raw.quest,
    code: isCode(raw.code) ? raw.code : null,
    screen: Array.isArray(raw.screen) ? raw.screen.filter(isScreen).slice(-MAX_SCREEN_EVENTS) : [],
    locations: Array.isArray(raw.locations) ? raw.locations.filter(isSample).slice(-MAX_SAMPLES) : [],
    bonusWalkMin: isNum(raw.bonusWalkMin) ? raw.bonusWalkMin : 0,
    lastVerdict: isVerdict(raw.lastVerdict) ? raw.lastVerdict : null,
    retryAt: isNum(raw.retryAt) ? raw.retryAt : null,
    missed: raw.missed === true,
    endedAt: isNum(raw.endedAt) ? raw.endedAt : null,
  };
}

/** Rebuild state from storage, keeping only well-formed parts. */
export function loadEngineState(raw: unknown): EngineState {
  const base = emptyState();
  if (!isObj(raw)) return base;
  const records = Array.isArray(raw.records) ? raw.records.map(loadRecord).filter((r): r is QuestRecord => r !== null) : [];
  const today = isObj(raw.stepsToday) && typeof raw.stepsToday.day === 'string' && isNum(raw.stepsToday.count) ? { day: raw.stepsToday.day, count: raw.stepsToday.count } : base.stepsToday;
  const lastPassed: Partial<Record<TaskType, number>> = {};
  if (isObj(raw.lastPassed)) {
    for (const t of TASK_TYPES) {
      const v = raw.lastPassed[t];
      if (isNum(v)) lastPassed[t] = v;
    }
  }
  return {
    version: SCHEMA_VERSION,
    records,
    stepCounter: isNum(raw.stepCounter) ? raw.stepCounter : 0,
    stepsToday: today,
    lastPassed,
    seq: isNum(raw.seq) ? raw.seq : 0,
  };
}

/** Keep every active record plus a few recent ended ones. */
export function pruneRecords(records: QuestRecord[], now: number): QuestRecord[] {
  const active = records.filter((r) => r.quest.status === 'active');
  const ended = records.filter((r) => r.quest.status !== 'active' && (r.endedAt ?? 0) > now - ENDED_KEEP_MS).slice(-MAX_ENDED);
  return records.filter((r) => active.includes(r) || ended.includes(r));
}
