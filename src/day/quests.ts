// OWNER: B (Spec B — task B3). The quest engine: the contract's Quests plus the actions the quest
// sheet needs (suggest, accept, live progress, verify, meetup photo, claim half). Pure: time,
// storage, ledger, device signals, planner and the step source are injected. Rules: "Task
// verification" in the planning doc and B-HANDOFF.md. Every pass → Ledger.credit + onVerified.
import type { AccessWindow, DeviceSignals, Ledger, LocationSample, Quest, Quests, QuestsDebug, TaskType, Unsub, Verdict } from '../contracts';
import { createEmitter, type Emitter } from '../shared/emitter';
import { sheetRequests as defaultSheetRequests, type SheetRequest } from './fakes';
import { readJson, type KV } from './kv';
import type { PlanActions } from './plan';
import { todaysPlan, type PlannerStore } from './planner';
import { evaluate, evaluateMeetupPhoto, liveReadout, passRate, type EvalContext, type LiveReadout } from './quest-evaluate';
import { blockedReason, CLAIM_HALF_RATE, METHOD_FOR, QUEST_TARGETS, QUEST_TTL_MS, questTypeFor, RETRY_AFTER_MS, suggestQuest, type Offer, type RuleContext } from './quest-rules';
import { emptyState, loadEngineState, MAX_SAMPLES, MAX_SCREEN_EVENTS, pruneRecords, STORAGE_KEY, type EngineState, type QuestRecord, type ScreenEvent } from './quest-state';
import { dayKey } from './time';
import { countMeetupWords } from './verifiers';
import { generateMeetupCode, type MeetupCode } from './wordlist';

export type { LiveReadout, Offer };

/** Steps since this subscription started (expo-sensors `Pedometer.watchStepCount` semantics). */
export type StepSource = { subscribe(fn: (stepsSinceStart: number) => void): Unsub };

export type QuestEngineDeps = {
  now: () => number;
  kv: KV;
  ledger: Pick<Ledger, 'credit'>;
  deviceSignals: DeviceSignals;
  planner: PlannerStore;
  planActions: Pick<PlanActions, 'markTask'>;
  steps: StepSource;
  /** Clock.onTick: drives silent expiry and screen-off stretches still running. */
  onTick?: (fn: (now: number) => void) => Unsub;
  meetupCode?: () => MeetupCode;
  sheetRequests?: Emitter<SheetRequest>;
};

export type AcceptResult = { ok: true; quest: Quest } | { ok: false; error: string };
export type VerifyResult =
  | { kind: 'passed'; quest: Quest; verdict: Verdict; minted: number; window: AccessWindow | null }
  | { kind: 'missed'; verdict: Verdict; retryAt: number | null }
  | { kind: 'wait'; verdict: Verdict; retryAt: number }
  | { kind: 'unavailable'; error: string };
export type QuestProgress = {
  quest: Quest;
  verdict: Verdict | null;
  retryAt: number | null;
  code: MeetupCode | null;
  canClaimHalf: boolean;
  live: LiveReadout;
};

export type QuestEngine = Quests & {
  start(): void;
  stop(): void;
  subscribe(fn: () => void): Unsub;
  suggest(now?: number): Offer | null;
  /** Why a quest of this type can't start right now (friendly copy), or null if it can. */
  blocked(type: TaskType): string | null;
  accept(type: TaskType, taskId?: string): AcceptResult;
  progress(questId: string): QuestProgress | null;
  verify(questId: string): VerifyResult;
  submitMeetupPhoto(questId: string, ocrText: string): VerifyResult;
  claimHalf(questId: string): VerifyResult;
  /** "Stop quest": ends a live quest quietly (no credit, no cooldown). */
  abandon(questId: string): boolean;
  stepsToday(): number;
  tick(): void;
  debug: QuestsDebug;
};

/** Debug `addSteps` stands for a real walk at this pace, so a demo walk isn't "too quick". */
const DEBUG_STEPS_PER_MIN = 100;
const MAX_OCR_CHARS = 2_000;
const unavailable = (error: string): VerifyResult => ({ kind: 'unavailable', error });

export function createQuestEngine(deps: QuestEngineDeps): QuestEngine {
  const changes = createEmitter<void>();
  const verified = createEmitter<{ q: Quest; v: Verdict; minted: number }>();
  const sheets = deps.sheetRequests ?? defaultSheetRequests;
  const makeCode = deps.meetupCode ?? (() => generateMeetupCode());
  let state: EngineState = loadEngineState(readJson(deps.kv, STORAGE_KEY));
  let started = false;
  let stepSourceLive = false;
  let lastSourceSteps = 0;
  const subs: { steps?: Unsub; tick?: Unsub; screen?: Unsub; location?: Unsub } = {};

  const save = (next: EngineState) => {
    state = { ...next, records: pruneRecords(next.records, deps.now()) };
    deps.kv.set(STORAGE_KEY, JSON.stringify(state));
    changes.emit();
  };
  const isLive = (r: QuestRecord) => r.quest.status === 'active' && deps.now() < r.quest.expiresAt;
  const liveRecords = () => state.records.filter(isLive);
  const find = (id: string) => state.records.find((r) => r.quest.id === id) ?? null;
  const replace = (s: EngineState, id: string, fn: (r: QuestRecord) => QuestRecord): EngineState => ({
    ...s,
    records: s.records.map((r) => (r.quest.id === id ? fn(r) : r)),
  });
  const stepsToday = () => (state.stepsToday.day === dayKey(deps.now()) ? state.stepsToday.count : 0);
  const evalCtx = (): EvalContext => ({ now: deps.now(), stepCounter: state.stepCounter, home: deps.planner.getState().home, stepSourceLive });
  const ruleCtx = (now = deps.now()): RuleContext => ({
    now,
    stepsToday: stepsToday(),
    activeTypes: liveRecords().map((r) => r.quest.type),
    lastPassed: state.lastPassed,
    hasHome: deps.planner.getState().home !== null,
  });
  const taskRate = (q: Quest) => todaysPlan(deps.planner.getState(), deps.now())?.tasks.find((t) => t.id === q.taskId)?.rate ?? 1;

  // ---- sensors: only listen while a quest needs them ----

  function syncSensors() {
    if (!started) return;
    const live = liveRecords();
    const needScreen = live.some((r) => r.quest.type === 'focus');
    const needLocation = live.some((r) => r.quest.type === 'place' || r.quest.type === 'meetup');
    if (needScreen && !subs.screen) subs.screen = deps.deviceSignals.onScreen(onScreen);
    if (!needScreen && subs.screen) {
      subs.screen();
      subs.screen = undefined;
    }
    if (needLocation && !subs.location) {
      subs.location = deps.deviceSignals.onLocation(onLocation);
      deps.deviceSignals.startLocation();
    }
    if (!needLocation && subs.location) {
      subs.location();
      subs.location = undefined;
      deps.deviceSignals.stopLocation();
    }
  }

  // ---- results ----

  function finishPass(r: QuestRecord, verdict: Verdict, rate: number): VerifyResult {
    let credit: ReturnType<Ledger['credit']>;
    try {
      credit = deps.ledger.credit({ category: r.quest.type, questId: r.quest.id, rate });
    } catch (e) {
      console.warn('[day] ledger.credit failed', e);
      return unavailable("Couldn't reach your umbrella — try again in a moment");
    }
    const t = deps.now();
    const quest: Quest = { ...r.quest, status: 'passed' };
    const next = replace(state, quest.id, (x) => ({ ...x, quest, lastVerdict: verdict, retryAt: null, endedAt: t }));
    save({ ...next, lastPassed: { ...next.lastPassed, [quest.type]: t } });
    if (quest.taskId) deps.planActions.markTask(quest.taskId, verdict.method === 'self_declared' ? 0.5 : 1);
    syncSensors();
    verified.emit({ q: quest, v: verdict, minted: credit.event.deltaMinutes });
    return { kind: 'passed', quest, verdict, minted: credit.event.deltaMinutes, window: credit.window };
  }

  function recordMiss(r: QuestRecord, verdict: Verdict, wait: boolean): VerifyResult {
    const retryAt = wait ? deps.now() + RETRY_AFTER_MS : null;
    save(replace(state, r.quest.id, (x) => ({ ...x, lastVerdict: verdict, missed: true, retryAt })));
    return { kind: 'missed', verdict, retryAt };
  }

  /** Auto-verify: pass silently when the evidence is there; a mocked location counts as a miss. */
  function autoCheck(r: QuestRecord) {
    const v = evaluate(r, evalCtx());
    if (v.pass) {
      finishPass(r, v, passRate(taskRate(r.quest), v));
      return;
    }
    const mocked = v.flags.includes('mocked_location');
    if (mocked && !r.lastVerdict?.flags.includes('mocked_location')) recordMiss(r, v, true);
  }

  function expireDue() {
    const now = deps.now();
    const due = state.records.filter((r) => r.quest.status === 'active' && now >= r.quest.expiresAt);
    if (due.length === 0) return;
    const ids = new Set(due.map((r) => r.quest.id));
    save({
      ...state,
      records: state.records.map((r) => (ids.has(r.quest.id) ? { ...r, quest: { ...r.quest, status: 'expired' }, endedAt: now } : r)),
    });
    syncSensors();
  }

  // ---- signal handlers ----

  function addStepCount(n: number, walkMin: number) {
    const day = dayKey(deps.now());
    const records = state.records.map((r) => (walkMin > 0 && isLive(r) && r.quest.type === 'fitness' ? { ...r, bonusWalkMin: r.bonusWalkMin + walkMin } : r));
    save({ ...state, records, stepCounter: state.stepCounter + n, stepsToday: { day, count: stepsToday() + n } });
    liveRecords().filter((r) => r.quest.type === 'fitness').forEach(autoCheck);
  }

  function onSteps(sinceStart: number) {
    if (!Number.isFinite(sinceStart)) return;
    stepSourceLive = true;
    const delta = sinceStart >= lastSourceSteps ? sinceStart - lastSourceSteps : sinceStart;
    lastSourceSteps = sinceStart;
    if (delta > 0) addStepCount(delta, 0);
  }

  function onScreen(e: ScreenEvent) {
    const focus = liveRecords().filter((r) => r.quest.type === 'focus' && e.at >= r.quest.acceptedAt);
    if (focus.length === 0) return;
    let next = state;
    for (const r of focus) next = replace(next, r.quest.id, (x) => ({ ...x, screen: [...x.screen, { at: e.at, on: e.on }].slice(-MAX_SCREEN_EVENTS) }));
    save(next);
    focus.forEach((r) => autoCheck(find(r.quest.id)!));
  }

  function onLocation(s: LocationSample) {
    const away = liveRecords().filter((r) => r.quest.type === 'place' || r.quest.type === 'meetup');
    if (away.length === 0) return;
    let next = state;
    for (const r of away) next = replace(next, r.quest.id, (x) => ({ ...x, locations: [...x.locations, { ...s }].slice(-MAX_SAMPLES) }));
    save(next);
    away.forEach((r) => {
      const fresh = find(r.quest.id)!;
      if (fresh.quest.type === 'place') autoCheck(fresh);
      else if (s.mocked && !fresh.lastVerdict?.flags.includes('mocked_location')) recordMiss(fresh, evaluate(fresh, evalCtx()), true);
    });
  }

  // ---- actions ----

  function accept(type: TaskType, taskId?: string): AcceptResult {
    expireDue();
    if (!questTypeFor(type)) return { ok: false, error: "That quest type isn't ready yet" };
    if (taskId !== undefined) {
      const task = todaysPlan(deps.planner.getState(), deps.now())?.tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, error: "That task is not in today's plan" };
      if (task.done >= 1) return { ok: false, error: 'That task is already done' };
      if (questTypeFor(task.type) !== type) return { ok: false, error: "That quest doesn't match the task" };
    }
    const blocked = blockedReason(type, ruleCtx());
    if (blocked) return { ok: false, error: blocked };
    const t = deps.now();
    const quest: Quest = {
      id: `quest-${t}-${state.seq}`,
      type,
      ...(taskId !== undefined ? { taskId } : {}),
      target: QUEST_TARGETS[type],
      acceptedAt: t,
      expiresAt: t + QUEST_TTL_MS,
      baseline: { steps: state.stepCounter },
      status: 'active',
    };
    const record: QuestRecord = { quest, code: type === 'meetup' ? makeCode() : null, screen: [], locations: [], bonusWalkMin: 0, lastVerdict: null, retryAt: null, missed: false, endedAt: null };
    save({ ...state, seq: state.seq + 1, records: [...state.records, record] });
    syncSensors();
    return { ok: true, quest };
  }

  /** Common gate for verify / photo / claim: the quest must still be running. */
  function liveOrError(questId: string): QuestRecord | string {
    expireDue();
    const r = find(questId);
    if (!r) return 'That quest is not around any more';
    if (r.quest.status !== 'active') return 'This quest has ended';
    return r;
  }

  function verify(questId: string): VerifyResult {
    const r = liveOrError(questId);
    if (typeof r === 'string') return unavailable(r);
    if (r.retryAt !== null && deps.now() < r.retryAt && r.lastVerdict) return { kind: 'wait', verdict: r.lastVerdict, retryAt: r.retryAt };
    const v = evaluate(r, evalCtx());
    if (r.quest.type === 'meetup') return { kind: 'missed', verdict: v, retryAt: null }; // passes only via a photo
    if (v.pass) return finishPass(r, v, passRate(taskRate(r.quest), v));
    return recordMiss(r, v, true);
  }

  function submitMeetupPhoto(questId: string, ocrText: string): VerifyResult {
    const r = liveOrError(questId);
    if (typeof r === 'string') return unavailable(r);
    if (r.quest.type !== 'meetup' || !r.code) return unavailable('This quest has no code to check');
    if (r.retryAt !== null && deps.now() < r.retryAt && r.lastVerdict) return { kind: 'wait', verdict: r.lastVerdict, retryAt: r.retryAt };
    const text = typeof ocrText === 'string' ? ocrText.slice(0, MAX_OCR_CHARS) : '';
    const v = evaluateMeetupPhoto(r, text, deps.planner.getState().home);
    if (v.pass) return finishPass(r, v, passRate(taskRate(r.quest), v));
    // Unlimited retakes: a misread photo never makes you wait; a location problem does.
    const misread = !v.flags.includes('mocked_location') && countMeetupWords(text, r.code) < QUEST_TARGETS.meetup;
    return recordMiss(r, v, !misread);
  }

  function claimHalf(questId: string): VerifyResult {
    const r = liveOrError(questId);
    if (typeof r === 'string') return unavailable(r);
    if (!r.missed) return unavailable('Give Verify a try first');
    const v: Verdict = {
      questId,
      pass: true,
      method: 'self_declared',
      reason: 'Claimed half — thanks for being honest',
      measured: r.lastVerdict?.measured ?? '',
      flags: [],
    };
    return finishPass(r, v, CLAIM_HALF_RATE * taskRate(r.quest));
  }

  function progress(questId: string): QuestProgress | null {
    const r = find(questId);
    if (!r) return null;
    const live = isLive(r);
    const quest: Quest = r.quest.status === 'active' && !live ? { ...r.quest, status: 'expired' } : r.quest;
    const ctx = evalCtx();
    return {
      quest,
      verdict: live ? evaluate(r, ctx) : r.lastVerdict,
      retryAt: r.retryAt,
      code: r.code,
      canClaimHalf: live && r.missed,
      live: liveReadout(r, ctx, live),
    };
  }

  function abandon(questId: string): boolean {
    const r = find(questId);
    if (!r || !isLive(r)) return false;
    save(replace(state, questId, (x) => ({ ...x, quest: { ...x.quest, status: 'expired' }, endedAt: deps.now() })));
    syncSensors();
    return true;
  }

  function tick() {
    expireDue();
    liveRecords().filter((r) => r.quest.type === 'focus').forEach(autoCheck);
  }

  // ---- debug (demo panel) ----

  const debug: QuestsDebug = {
    reset() {
      save(emptyState());
      syncSensors();
    },
    seed() {
      debug.reset();
    },
    addSteps(n) {
      if (!Number.isFinite(n) || n <= 0) return;
      addStepCount(Math.round(n), n / DEBUG_STEPS_PER_MIN);
    },
    passActive() {
      expireDue();
      let r = liveRecords()[0];
      if (!r) {
        const made = accept('fitness');
        const fallback = made.ok ? made : accept('focus');
        if (!fallback.ok) return;
        r = find(fallback.quest.id)!;
      }
      const v: Verdict = { questId: r.quest.id, pass: true, method: METHOD_FOR[r.quest.type], reason: 'Done (demo)', measured: `${r.quest.target} of ${r.quest.target}`, flags: [] };
      finishPass(r, v, taskRate(r.quest));
    },
  };

  return {
    openSheet: (ctx) => sheets.emit({ ...ctx }),
    active: () => liveRecords().map((r) => r.quest),
    onVerified: (fn) => verified.on(({ q, v, minted }) => fn(q, v, minted)),
    start() {
      if (started) return;
      started = true;
      lastSourceSteps = 0;
      subs.steps = deps.steps.subscribe(onSteps);
      if (deps.onTick) subs.tick = deps.onTick(() => tick());
      expireDue();
      syncSensors();
    },
    stop() {
      subs.steps?.();
      subs.tick?.();
      subs.steps = undefined;
      subs.tick = undefined;
      started = false;
      // Same teardown as syncSensors with nothing live.
      subs.screen?.();
      subs.screen = undefined;
      if (subs.location) {
        subs.location();
        subs.location = undefined;
        deps.deviceSignals.stopLocation();
      }
    },
    subscribe: (fn) => changes.on(fn),
    suggest: (now = deps.now()) => suggestQuest(deps.planner.getState(), ruleCtx(now)),
    blocked: (type) => blockedReason(type, ruleCtx()),
    accept,
    progress,
    verify,
    submitMeetupPhoto,
    claimHalf,
    abandon,
    stepsToday,
    tick,
    debug,
  };
}
