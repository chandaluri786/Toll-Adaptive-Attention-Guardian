// OWNER: B (Spec B — task B3). Pure: turn a quest record into a live verdict using the verifiers,
// and apply the soft cross-signal flags that lower the rate (never block).
import type { LocationSample, Verdict } from '../contracts';
import { MIN } from '../shared/emitter';
import { FLAGGED_RATE, FLAT_STEPS } from './quest-rules';
import type { QuestRecord } from './quest-state';
import { locationMissReason, verifyAwayFromHome, verifyMeetup, verifyScreenOff, verifySteps } from './verifiers';

export type Home = { lat: number; lon: number };
export type EvalContext = { now: number; stepCounter: number; home: Home | null; stepSourceLive: boolean };

const NO_HOME = 'Set your home first — Settings → Planner';

const plain = (r: QuestRecord, reason: string, measured: string): Verdict => ({
  questId: r.quest.id,
  pass: false,
  method: r.quest.type === 'meetup' ? 'meetup_code' : 'away_minutes',
  reason,
  measured,
  flags: [],
});

export const stepsSince = (r: QuestRecord, stepCounter: number) => Math.max(0, stepCounter - (r.quest.baseline.steps ?? stepCounter));

/** A mocked sample poisons the whole quest; otherwise the latest sample is what counts. */
export function meetupSample(samples: LocationSample[]): LocationSample | null {
  return samples.find((s) => s.mocked) ?? samples.reduce<LocationSample | null>((a, s) => (!a || s.at > a.at ? s : a), null);
}

/** Cross-signal: a place pass with flat steps looks like a drive-by; flag it (if we have a pedometer). */
function withCrossSignal(r: QuestRecord, v: Verdict, ctx: EvalContext): Verdict {
  if (!v.pass || r.quest.type !== 'place' || !ctx.stepSourceLive) return v;
  return stepsSince(r, ctx.stepCounter) < FLAT_STEPS ? { ...v, flags: [...v.flags, 'flat_steps'] } : v;
}

/** Live readout for a meetup before (or between) photos: is the location good enough yet? */
function meetupReadout(r: QuestRecord, home: Home): Verdict {
  const sample = meetupSample(r.locations);
  const miss = locationMissReason(sample, home);
  const flags = sample?.mocked ? ['mocked_location'] : [];
  if (r.lastVerdict && !r.lastVerdict.pass && r.lastVerdict.method === 'meetup_code' && !miss) return r.lastVerdict;
  return { questId: r.quest.id, pass: false, method: 'meetup_code', reason: miss ?? 'Write the code big and snap it', measured: '0 of 3 words', flags };
}

/** The verdict a quest would get right now. Meetups only pass through a photo, never here. */
export function evaluate(r: QuestRecord, ctx: EvalContext): Verdict {
  const q = r.quest;
  switch (q.type) {
    case 'fitness': {
      const minutes = (ctx.now - q.acceptedAt) / MIN + r.bonusWalkMin;
      return verifySteps(q.id, stepsSince(r, ctx.stepCounter), minutes, q.target);
    }
    case 'focus':
      return verifyScreenOff(q.id, r.screen, q.target, ctx.now);
    case 'place':
      if (!ctx.home) return plain(r, NO_HOME, `0 of ${q.target} min`);
      return withCrossSignal(r, verifyAwayFromHome(q.id, r.locations, ctx.home, q.target), ctx);
    case 'meetup':
      return ctx.home ? meetupReadout(r, ctx.home) : plain(r, NO_HOME, '0 of 3 words');
    default:
      return plain(r, "This quest type isn't ready yet", '');
  }
}

/** Meetup photo check: the code must read and the location must be away from home. */
export function evaluateMeetupPhoto(r: QuestRecord, ocrText: string, home: Home | null): Verdict {
  if (!home || !r.code) return plain(r, NO_HOME, '0 of 3 words');
  return verifyMeetup(r.quest.id, ocrText, r.code, meetupSample(r.locations), home);
}

/** Rate for a pass: the plan task's rate (0.5 if added after the lock), lowered if flagged. */
export function passRate(taskRate: number, v: Verdict): number {
  return v.flags.length > 0 ? taskRate * FLAGGED_RATE : taskRate;
}
