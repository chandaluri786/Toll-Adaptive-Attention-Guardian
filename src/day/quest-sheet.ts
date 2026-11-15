// OWNER: B (task B8). The quest sheet's state and view model, pure: offer (3.1) → in progress with
// a live readout (3.2–3.4) → pass (3.5) or not yet (3.6); meetups hand over to B7's flow (3.7–3.9).
// The sheet talks to a SheetPort (./quest-sheet-port.ts): the real quest engine, or the fakes.
import type { Quest, TaskType, Verdict } from '../contracts';
import { asSentence, formatCount, formatMinSec } from './format';
import type { CaptureVerdict } from './meetup-capture';
import { CHIP_ORDER, payFor, QUEST_COPY } from './quest-copy';
import { QUEST_TARGETS } from './quest-rules';
import type { QuizRound } from './quiz-bank';
import type { AcceptResult, LiveReadout, Offer, VerifyResult } from './quests';
import { AWAY_RADIUS_M } from './verifiers';
import type { MeetupCode } from './wordlist';

export type SheetProgress = { live: LiveReadout; canClaimHalf: boolean; retryAt: number | null };
export type MeetupContext = { code: MeetupCode; startedAt: number; submit: (ocrText: string) => CaptureVerdict; practice: boolean };

/** Everything the sheet needs from the day module. */
export type SheetPort = {
  live(): Quest[];
  suggest(): Offer | null;
  blockedReason(type: TaskType): string | null;
  /** The plan task's rate (0.5 if added after the lock), 1 for a standing goal. */
  taskRate(taskId?: string): number;
  accept(type: TaskType, taskId?: string): AcceptResult;
  progress(questId: string): SheetProgress | null;
  verify(questId: string): VerifyResult;
  claimHalf(questId: string): VerifyResult;
  abandon(questId: string): void;
  meetup(questId: string): MeetupContext | null;
  /** B10: the open round of a study quest (null = no questions, or waiting out a miss). */
  quizRound?(questId: string): QuizRound | null;
  answerQuiz?(questId: string, answers: readonly number[]): VerifyResult;
  /** Fakes only: show the not-yet state on demand (the stub sensors never miss). */
  simulateMiss?(questId: string): VerifyResult;
};

/** What opened the sheet. `offer` = a specific quest (Today's Verify / suggested quest). */
export type OpenRequest = { offer?: { type: TaskType; taskId?: string } };

export type Phase =
  | { kind: 'offer'; type: TaskType; taskId?: string; error: string | null }
  | { kind: 'active'; quest: Quest; notice: string | null }
  | { kind: 'meetup'; quest: Quest }
  | { kind: 'notYet'; quest: Quest; reason: string; retryAt: number | null }
  | { kind: 'passed'; quest: Quest; minted: number; umbrellaUp: boolean; half: boolean };

const DEFAULT_TYPE: TaskType = 'fitness';

const activeOrMeetup = (quest: Quest): Phase => (quest.type === 'meetup' ? { kind: 'meetup', quest } : { kind: 'active', quest, notice: null });

/** Where the sheet starts: a live quest resumes; otherwise the requested or suggested offer. */
export function openPhase(port: SheetPort, req: OpenRequest = {}): Phase {
  const live = port.live();
  const want = req.offer;
  const match = want ? live.find((q) => (want.taskId ? q.taskId === want.taskId : q.type === want.type)) ?? live.find((q) => q.type === want.type) : live[0];
  if (match) return activeOrMeetup(match);
  if (want) return { kind: 'offer', type: want.type, ...(want.taskId ? { taskId: want.taskId } : {}), error: null };
  const s = port.suggest();
  if (s) return { kind: 'offer', type: s.type, ...(s.taskId ? { taskId: s.taskId } : {}), error: null };
  return { kind: 'offer', type: DEFAULT_TYPE, error: null };
}

/** Picking another quest from the "Other quests" chips drops the plan-task link. */
export const pickOffer = (type: TaskType): Phase => ({ kind: 'offer', type, error: null });

export function afterAccept(phase: Extract<Phase, { kind: 'offer' }>, r: AcceptResult): Phase {
  return r.ok ? activeOrMeetup(r.quest) : { ...phase, error: r.error };
}

/** Verify, claim half and the fake miss all land here. */
export function afterVerify(phase: Extract<Phase, { kind: 'active' | 'notYet' }>, r: VerifyResult, half = false): Phase {
  switch (r.kind) {
    case 'passed':
      return { kind: 'passed', quest: r.quest, minted: r.minted, umbrellaUp: r.window !== null, half };
    case 'missed':
    case 'wait':
      return { kind: 'notYet', quest: phase.quest, reason: asSentence(r.verdict.reason), retryAt: r.retryAt };
    case 'unavailable':
      return phase.kind === 'active' ? { ...phase, notice: r.error } : { kind: 'active', quest: phase.quest, notice: r.error };
  }
}

/**
 * Quests also pass on their own (steps reach 2,000, 45 min away): Quests.onVerified moves an open
 * sheet showing that quest to the pass screen. In Storm the ledger opens the umbrella instead.
 */
export function onVerifiedPhase(phase: Phase, q: Quest, v: Verdict, minted: number, storm: boolean): Phase {
  if (phase.kind !== 'active' && phase.kind !== 'notYet' && phase.kind !== 'meetup') return phase;
  if (phase.quest.id !== q.id) return phase;
  return { kind: 'passed', quest: q, minted, umbrellaUp: storm, half: v.method === 'self_declared' };
}

// ---- view models ----

export type OfferChip = { type: TaskType; label: string; pays: string; disabled: boolean };
export type OfferView = { type: TaskType; title: string; pays: string; checks: string[]; blocked: string | null; others: OfferChip[] };

export function offerView(port: SheetPort, phase: Extract<Phase, { kind: 'offer' }>): OfferView {
  const copy = QUEST_COPY[phase.type];
  const others = CHIP_ORDER.filter((t) => t !== phase.type).map((t) => ({
    type: t,
    label: QUEST_COPY[t].chip,
    pays: `+${payFor(t)}`,
    disabled: port.blockedReason(t) !== null,
  }));
  return {
    type: phase.type,
    title: copy.offerTitle,
    pays: `Pays ${payFor(phase.type, port.taskRate(phase.taskId))} min of umbrella time`,
    checks: copy.checks,
    blocked: phase.error ?? port.blockedReason(phase.type),
    others,
  };
}

export type Readout = { big: string; sub: string; fraction: number; line: string };

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const roundTo10 = (m: number) => Math.round(m / 10) * 10;
/** Debug walks and the step rules both assume about 100 steps a minute. */
const STEPS_PER_MIN = 100;

function distanceLine(d: number | null): string {
  if (d === null) return 'Waiting for a location fix';
  if (d <= AWAY_RADIUS_M) return `${roundTo10(d)} m from home · head past ${AWAY_RADIUS_M} m`;
  return `${roundTo10(d)} m from home · keep wandering`;
}

/** The ring's numbers and the line under it, per quest type (3.2 steps, 3.3 away, 3.4 phone-down). */
export function readout(type: TaskType, live: LiveReadout, target = QUEST_TARGETS[type]): Readout {
  switch (type) {
    case 'fitness': {
      const left = Math.max(0, target - live.steps);
      const mins = Math.ceil(left / STEPS_PER_MIN);
      const line = left === 0 ? "That's the lot — tap Verify now" : `About ${mins} minute${mins === 1 ? '' : 's'} of walking left`;
      return { big: formatCount(Math.min(live.steps, target)), sub: `of ${formatCount(target)} steps`, fraction: clamp01(live.steps / target), line };
    }
    case 'place':
      return { big: `${Math.min(live.awayMin, target)}`, sub: `of ${target} minutes`, fraction: clamp01(live.awayMin / target), line: distanceLine(live.distanceM) };
    case 'focus': {
      const targetMs = target * 60_000;
      const ms = Math.min(live.offMs, targetMs);
      return { big: formatMinSec(ms), sub: `of ${formatMinSec(targetMs)}`, fraction: clamp01(ms / targetMs), line: 'Face down, screen off. Keep it there.' };
    }
    default:
      return { big: '0', sub: `of ${target}`, fraction: 0, line: '' };
  }
}

export type ActiveView = { title: string; readout: Readout; pays: string };

export function activeView(port: SheetPort, quest: Quest, progress: SheetProgress | null): ActiveView {
  const live = progress?.live ?? { steps: 0, awayMin: 0, distanceM: null, offMs: 0 };
  return {
    title: QUEST_COPY[quest.type].activeTitle,
    readout: readout(quest.type, live, quest.target),
    pays: `Pays ${payFor(quest.type, port.taskRate(quest.taskId))} min when it's done`,
  };
}

export type NotYetView = { reason: string; hint: string | null; retry: { label: string; ready: boolean }; claimHalf: string | null };

export function notYetView(port: SheetPort, phase: Extract<Phase, { kind: 'notYet' }>, progress: SheetProgress | null, now: number): NotYetView {
  const waiting = phase.retryAt !== null && now < phase.retryAt;
  const half = payFor(phase.quest.type, port.taskRate(phase.quest.taskId) * 0.5);
  return {
    reason: phase.reason,
    hint: QUEST_COPY[phase.quest.type].missHint,
    retry: waiting ? { label: `Try again in ${formatMinSec(phase.retryAt! - now)}`, ready: false } : { label: 'Try again', ready: true },
    claimHalf: progress?.canClaimHalf ? `Didn't catch it? Claim half — ${half} min` : null,
  };
}

/** The umbrella card's bar is full at an hour of umbrella time. */
export const UMBRELLA_BAR_MIN = 60;

export type PassView = { headline: string; sub: string; balance: number; fraction: number };

export function passView(phase: Extract<Phase, { kind: 'passed' }>, balance: number): PassView {
  const headline = phase.half ? 'Half it is.' : QUEST_COPY[phase.quest.type].passHeadline;
  const sub = phase.umbrellaUp ? `Umbrella up — ${phase.minted} minutes, starting now.` : `${phase.minted} minutes dropped into your umbrella.`;
  return { headline, sub, balance, fraction: clamp01(balance / UMBRELLA_BAR_MIN) };
}
