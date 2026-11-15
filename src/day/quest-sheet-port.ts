// OWNER: B (task B8). The quest sheet's two backends: the real quest engine (when the day module
// exposes `engine`, like B7 does) and the hour-0 fakes (USE_REAL=false), where Verify is a stub
// pass that still credits the fake ledger and a demo link shows the not-yet state.
import type { AccessWindow, Ledger, Quest, Quests, TaskType, Verdict } from '../contracts';
import { fromVerifyResult, practiceSubmitter } from './meetup-capture';
import { todaysPlan, type PlannerStore } from './planner';
import { blockedReason, CLAIM_HALF_RATE, METHOD_FOR, QUEST_TARGETS, QUEST_TTL_MS, RETRY_AFTER_MS } from './quest-rules';
import type { MeetupContext, SheetPort } from './quest-sheet';
import type { Offer, QuestEngine, VerifyResult } from './quests';
import { generateMeetupCode, type MeetupCode } from './wordlist';

const NO_LIVE = { steps: 0, awayMin: 0, distanceM: null, offMs: 0 };

export function engineSheetPort(engine: QuestEngine, store: PlannerStore, now: () => number): SheetPort {
  return {
    live: () => engine.active(),
    suggest: () => engine.suggest(),
    blockedReason: (type) => engine.blocked(type),
    taskRate: (taskId) => (taskId ? (todaysPlan(store.getState(), now())?.tasks.find((t) => t.id === taskId)?.rate ?? 1) : 1),
    accept: (type, taskId) => engine.accept(type, taskId),
    progress(id) {
      const p = engine.progress(id);
      return p ? { live: p.live, canClaimHalf: p.canClaimHalf, retryAt: p.retryAt } : null;
    },
    verify: (id) => engine.verify(id),
    claimHalf: (id) => engine.claimHalf(id),
    abandon: (id) => void engine.abandon(id),
    quizRound: (id) => engine.quizRound(id),
    answerQuiz: (id, answers) => engine.answerQuiz(id, answers),
    meetup(id): MeetupContext | null {
      const p = engine.progress(id);
      if (!p?.code) return null;
      return { code: p.code, startedAt: p.quest.acceptedAt, submit: (text) => fromVerifyResult(engine.submitMeetupPhoto(id, text)), practice: false };
    },
  };
}

export type FakeSheetDeps = {
  now: () => number;
  /** debug.day.accept / passActive from the fake day module. */
  accept: (type: TaskType) => Quest;
  passActive: () => void;
  quests: Pick<Quests, 'active' | 'onVerified'>;
  ledger: Pick<Ledger, 'credit' | 'activeWindows'>;
  meetupCode?: () => MeetupCode;
};

/** Canned "not yet" reasons for the fake demo link (same wording as the real verifiers). */
const FAKE_MISS: Partial<Record<TaskType, string>> = {
  fitness: 'Give it at least 5 min of walking',
  place: "You're 200 m from home — need 500 m",
  focus: 'Phone down for 12 min — need 25 in a row',
};

const FAKE_OFFER: Offer = { type: 'fitness', title: 'Walk 2,000 steps', target: QUEST_TARGETS.fitness, estMin: 20 };

export function fakeSheetPort(deps: FakeSheetDeps): SheetPort {
  const ended = new Set<string>();
  const missed = new Map<string, number>(); // questId → retryAt
  const practice = new Map<string, { quest: Quest; code: MeetupCode }>();
  let lastMinted = 0;
  deps.quests.onVerified((_q, _v, minted) => {
    lastMinted = minted;
  });

  const live = (): Quest[] => [...deps.quests.active(), ...[...practice.values()].map((p) => p.quest)].filter((q) => !ended.has(q.id));
  const find = (id: string) => live().find((q) => q.id === id) ?? null;
  const verdict = (q: Quest, pass: boolean, reason: string, method: Verdict['method'] = METHOD_FOR[q.type]): Verdict => ({ questId: q.id, pass, method, reason, measured: '', flags: [] });
  const newWindow = (before: number): AccessWindow | null => {
    const after = deps.ledger.activeWindows();
    return after.length > before ? after[after.length - 1] : null;
  };

  /** The fake's passActive passes its first live quest (and ticks the fake plan); else credit directly. */
  function pass(q: Quest): VerifyResult {
    const before = deps.ledger.activeWindows().length;
    let minted: number;
    if (deps.quests.active()[0]?.id === q.id) {
      deps.passActive();
      minted = lastMinted;
    } else {
      minted = deps.ledger.credit({ category: q.type, questId: q.id, rate: 1 }).event.deltaMinutes;
    }
    ended.add(q.id);
    return { kind: 'passed', quest: { ...q, status: 'passed' }, verdict: verdict(q, true, 'Done'), minted, window: newWindow(before) };
  }

  function acceptPractice(): Quest {
    const t = deps.now();
    const quest: Quest = { id: `practice-${t}`, type: 'meetup', target: QUEST_TARGETS.meetup, acceptedAt: t, expiresAt: t + QUEST_TTL_MS, baseline: {}, status: 'active' };
    practice.set(quest.id, { quest, code: (deps.meetupCode ?? generateMeetupCode)() });
    return quest;
  }

  const blocked = (type: TaskType) => blockedReason(type, { now: deps.now(), stepsToday: 0, activeTypes: live().map((q) => q.type), lastPassed: {}, hasHome: true });

  return {
    live,
    suggest: () => FAKE_OFFER,
    blockedReason: blocked,
    taskRate: () => 1,
    accept(type) {
      const error = blocked(type);
      if (error) return { ok: false, error };
      return { ok: true, quest: type === 'meetup' ? acceptPractice() : deps.accept(type) };
    },
    progress: (id) => (find(id) ? { live: NO_LIVE, canClaimHalf: missed.has(id), retryAt: missed.get(id) ?? null } : null),
    verify(id) {
      const q = find(id);
      return q ? pass(q) : { kind: 'unavailable', error: 'That quest is not around any more' };
    },
    claimHalf(id) {
      const q = find(id);
      if (!q) return { kind: 'unavailable', error: 'That quest is not around any more' };
      if (!missed.has(id)) return { kind: 'unavailable', error: 'Give Verify a try first' };
      const before = deps.ledger.activeWindows().length;
      const { event } = deps.ledger.credit({ category: q.type, questId: q.id, rate: CLAIM_HALF_RATE });
      ended.add(id);
      const v = verdict(q, true, 'Claimed half — thanks for being honest', 'self_declared');
      return { kind: 'passed', quest: { ...q, status: 'passed' }, verdict: v, minted: event.deltaMinutes, window: newWindow(before) };
    },
    abandon: (id) => void ended.add(id),
    meetup(id) {
      const p = practice.get(id);
      if (!p || ended.has(id)) return null;
      const check = practiceSubmitter(p.code);
      const submit: MeetupContext['submit'] = (text) => {
        const v = check(text);
        if (v.kind === 'passed') ended.add(id);
        return v;
      };
      return { code: p.code, startedAt: p.quest.acceptedAt, submit, practice: true };
    },
    simulateMiss(id) {
      const q = find(id);
      if (!q) return { kind: 'unavailable', error: 'That quest is not around any more' };
      const retryAt = deps.now() + RETRY_AFTER_MS;
      missed.set(id, retryAt);
      return { kind: 'missed', verdict: verdict(q, false, FAKE_MISS[q.type] ?? 'Not quite there yet'), retryAt };
    },
  };
}
