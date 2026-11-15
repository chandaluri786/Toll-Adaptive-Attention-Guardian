// OWNER: all three, frozen at hour 1:30. See docs/contract.md.
// A change needs all three people and lands as one commit that also updates every fake.
// Users see weather: open = Clear skies, metered = Cloudy, sealed = Storm. Code keeps these names.

export type Unsub = () => void;
export type Posture = 'open' | 'metered' | 'sealed';
export type AppClass = 'essential' | 'discretionary' | 'restricted'; // essential includes the 2 chosen messaging apps
export type TaskType = 'fitness' | 'place' | 'meetup' | 'study' | 'coding' | 'focus';
export type ReasonCode =
  | 'schedule'
  | 'sleep'
  | 'wind_down'
  | 'scrolling'
  | 'urge'
  | 'deficit'
  | 'win'
  | 'emergency'
  | 'none';

// ---- shared data ----
export type PostureState = {
  posture: Posture;
  score: number; // 0..100
  reason: string; // "Storm until 11:00 — you're in Algorithms."
  reasonCode: ReasonCode;
  nextChange: { at: number; to: Posture } | null;
  grace: boolean; // true during the 90-s "clouds gathering" advisory
  allowanceLeftMin: number; // free time left today, 120 at 04:00
  computedAt: number; // A fails open if older than 3 min (monotonic clock)
};

export type Signals = {
  // built inside C from A's and B's feeds
  baseScore: number; // 0 outside declared blocks
  deficit: number; // 0..1; 0 with no tasks or inside sleep
  scrollMinutes60: number;
  urgeCount15: number;
  minutesSinceWin: number | null;
  allowanceLeftMin: number; // > 0 means behaviour signals are ignored
};

export type Block = {
  type: 'class' | 'meeting' | 'deep_work' | 'wind_down' | 'sleep';
  title: string;
  start: number;
  end: number; // max 4 h, sleep max 10 h
};

export type Quest = {
  id: string;
  type: TaskType;
  taskId?: string; // set = ticks that plan task when it verifies
  target: number;
  acceptedAt: number;
  expiresAt: number; // acceptedAt + 4 h
  baseline: Record<string, number>;
  status: 'offered' | 'active' | 'passed' | 'failed' | 'expired';
};

export type Verdict = {
  questId: string;
  pass: boolean;
  method:
    | 'step_delta'
    | 'away_minutes'
    | 'screen_off'
    | 'meetup_code'
    | 'quiz'
    | 'commit_delta'
    | 'self_declared';
  reason: string;
  measured: string; // "620 of 2,000"
  flags: string[]; // soft: lower the rate, never block
};

export type LedgerCategory = TaskType | 'spend' | 'emergency' | 'reset';
export type LedgerEvent = {
  id: string;
  at: number;
  deltaMinutes: number;
  category: LedgerCategory; // only id, at, deltaMinutes sync to the server
  questId?: string;
};

export type Scope = AppClass | 'all' | { domain: string };
export type AccessWindow = {
  id: string;
  scope: Scope;
  until: number;
  source: 'spend' | 'quest' | 'emergency';
};
export type SpendResult = { ok: true; window: AccessWindow } | { ok: false; shortfall: number };

export type DaySummary = {
  // kept on the phone only, 180 days, for Forecast
  date: string; // YYYY-MM-DD
  restrictedMin: number;
  pastFreeMin: number;
  stormMin: number;
  questOpenedMin: number;
  earned: number;
  spent: number;
  tasksPlanned: number | null; // null = no plan that day
  tasksDone: number;
  questsByCategory: Partial<Record<TaskType, number>>;
  emergencyUnlocks: number[]; // timestamps
};

// ---- provided by C (src/engine, src/ledger) ----
export interface Clock {
  now(): number;
  onTick(fn: (now: number) => void): Unsub; // 60-s tick
}

export interface PostureSource {
  get(): PostureState;
  subscribe(fn: (s: PostureState) => void): Unsub;
}

export interface Ledger {
  balance(): number; // umbrella time; 0 at 04:00
  spend(minutes: number, scope: Scope): SpendResult; // Cloudy only; refused in Storm
  credit(c: { category: TaskType; questId: string; rate: number }): {
    // rate 1, 0.5 fallback, lower if flagged
    event: LedgerEvent;
    window: AccessWindow | null; // set in Storm: opens at once
  };
  activeWindows(): AccessWindow[];
  history(days: number): DaySummary[];
  onChange(fn: () => void): Unsub;
}

export interface Governor {
  emergencyUnlock(): AccessWindow | null; // 15 min, all apps; null if used today
  emergencyLeftToday(): number; // 1 or 0
}

// ---- provided by A (src/device) ----
export type ForegroundSample = { at: number; pkg: string; appClass: AppClass };
export type LocationSample = {
  at: number;
  lat: number;
  lon: number;
  accuracyM: number;
  mocked: boolean;
};

export interface UsageFeed {
  onSample(fn: (s: ForegroundSample) => void): Unsub; // once a second
  onIntercept(fn: (s: ForegroundSample) => void): Unsub; // an open that showed the Storm screen
}

export interface DeviceSignals {
  onScreen(fn: (e: { at: number; on: boolean }) => void): Unsub;
  startLocation(): void;
  stopLocation(): void; // 60-s samples
  onLocation(fn: (s: LocationSample) => void): Unsub;
}

// ---- provided by B (src/day) ----
export interface Planner {
  planSet(): boolean; // optional: false is a normal state
  progress(): { done: number; total: number }; // total 0 = no tasks; self-declared counts 0.5
  currentBlock(now: number): Block | null;
  nextBlock(now: number): Block | null;
  sleepWindow(): { start: string; end: string }; // default "23:00", "07:00"
  home(): { lat: number; lon: number } | null;
  remindersDue(now: number): 'morning' | 'noon' | null;
  openPlanSheet(): void;
  onChange(fn: () => void): Unsub;
}

export interface Quests {
  openSheet(ctx: { from: 'storm_screen' | 'today'; posture: Posture; pkg?: string }): void;
  active(): Quest[];
  onVerified(fn: (q: Quest, v: Verdict, mintedMinutes: number) => void): Unsub;
}

// ---- every folder's index.ts also exports ----
export type Seed = 'fresh' | 'demo_2pm' | 'late_night' | 'no_plan';
export interface Debug {
  reset(): void;
  seed(s: Seed): void;
}
export interface QuestsDebug extends Debug {
  addSteps(n: number): void;
  passActive(): void;
}

// ---- the whole app's services, wired in src/services.ts ----
export type Services = {
  clock: Clock;
  postureSource: PostureSource;
  governor: Governor;
  ledger: Ledger;
  usageFeed: UsageFeed;
  deviceSignals: DeviceSignals;
  planner: Planner;
  quests: Quests;
};
export type GetServices = () => Services;
