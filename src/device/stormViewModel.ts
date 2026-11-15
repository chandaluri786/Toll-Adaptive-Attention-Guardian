// OWNER: A (Spec A, task A6). Decides what the Storm / Cloud screen shows, as plain data.
//
// The screen is the one judges look at hardest, so its logic lives here, separate from the pixels: every
// state in the approved design (Cloudy with / without umbrella time, Storm, waiting, emergency unlock
// steps and "already used", the umbrella-opened screen, clouds gathering) is one return value of
// `stormViewModel`, covered by unit tests. Copy is taken word for word from the design
// (docs/DESIGN.md). Strict order on screen: 1. weather + reason  2. umbrella time  3. choices.
// Copy rules: calm and specific; never "blocked" or "failed"; no red.
import type { Posture } from '../contracts';
import type { Decision } from './policy';
import type { IconName } from '../ui/Icon';

/** Minutes of access one "Open umbrella" choice buys. */
export const SPEND_MINUTES = 15;
export const WAIT_SECONDS = 60;

export type StormInput = {
  posture: Posture;
  reason: string; // from PostureState.reason, already in weather words
  grace: boolean; // the 90-second "clouds gathering" advisory
  /** Seconds left of the 90-second advisory (only used when `grace`). */
  graceLeft?: number;
  appName: string | null;
  /** Why the blocker opened this screen: a fresh open, or an unlock that ran out inside the app. */
  trigger: 'opened' | 'expired';
  balance: number; // umbrella time, minutes
  emergencyLeft: number; // 1 or 0
  /** When the weather clears, as "11:00" (from PostureState.nextChange). Null hides the line. */
  clearsAt: string | null;
  /** Seconds left of "Wait 60 seconds": null = not started, > 0 = counting down, 0 = finished. */
  waitLeft?: number | null;
  /** When today's emergency unlock was used, as "08:12", for the "already used" line. */
  emergencyUsedAt?: string | null;
  /** The policy decision for this app, when its package is known. Defaults to the posture's rule. */
  decision?: Extract<Decision, { kind: 'intercept' }>;
};

export type DoorVariant = 'secondary' | 'primary' | 'disabled';
/** One of the stacked choices ("doors") under the umbrella card. */
export type Door = {
  key: 'wait' | 'umbrella' | 'quest';
  icon: IconName;
  title: string;
  sub: string;
  variant: DoorVariant;
  /** 0..1 progress shown as a fill behind the door (the 60-second wait). */
  fill: number;
};

export type StormViewModel = {
  /**
   * 'grace' = only a warning banner over the app; nothing is restricted yet.
   * 'clear' = Clear skies: nothing is restricted, so there is no wait and no choice to make, just "Open <app>".
   */
  mode: 'grace' | 'clear' | 'cloudy' | 'storm';
  /** The big serif word: "Clear skies", "Cloudy" or "Storm". */
  weatherName: string;
  appName: string;
  /** First letter of the app, shown in its little badge. */
  appLetter: string;
  reason: string;
  note: string | null;
  clears: string | null;
  umbrella: { minutes: number; note: string };
  doors: Door[];
  emergency: { label: string; available: boolean };
  /** The clouds-gathering banner: alone in mode 'grace', over the Cloudy screen when it already restricts. */
  gather: { title: string; body: string } | null;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const defaultDecision = (posture: Posture): Extract<Decision, { kind: 'intercept' }> => ({
  kind: 'intercept',
  canSpend: posture === 'metered',
  spendRate: 1,
  questPrimary: posture === 'sealed',
});

export function stormViewModel(i: StormInput): StormViewModel {
  const decision = i.decision ?? defaultDecision(i.posture);
  const appName = i.appName ?? 'a distracting app';
  const storm = i.posture === 'sealed';
  const cost = Math.ceil(SPEND_MINUTES / decision.spendRate); // a Discretionary app in a Storm costs double
  const short = i.balance < cost;

  const emergency = {
    available: i.emergencyLeft > 0,
    label:
      i.emergencyLeft > 0
        ? `Emergency unlock (${i.emergencyLeft} left today)`
        : `Emergency unlock used${i.emergencyUsedAt ? ` at ${i.emergencyUsedAt}` : ''}. Back tomorrow.`,
  };

  const base = {
    appName,
    appLetter: (i.appName ?? 'A').charAt(0).toUpperCase(),
    reason: i.reason,
    clears: i.clearsAt ? `Clears at ${i.clearsAt}` : null,
    // The note says what the umbrella door costs; when there is no umbrella door (a Storm), why.
    umbrella: { minutes: i.balance, note: i.posture === 'open' ? 'Saved for when clouds roll in' : decision.canSpend ? `Opening costs ${cost}` : 'Storm takes fresh quest time only' },
    emergency,
  };

  const gather = i.grace ? { title: `Clouds gathering · ${mmss(i.graceLeft ?? 90)}`, body: i.reason } : null;

  // Clouds gathering from Clear skies: a warning only. No doors: nothing is restricted until the advisory ends.
  // From a weather that already restricts (Cloudy), that weather's screen stays, with the banner on top.
  if (gather && i.posture === 'open') {
    return {
      ...base,
      mode: 'grace',
      weatherName: 'Clouds gathering',
      note: null,
      doors: [],
      gather,
    };
  }

  // Clear skies: nothing is restricted, so nothing is made to wait. (The blocker does not normally show this
  // screen in Clear skies; it is reachable when the weather clears while the screen is open.)
  if (i.posture === 'open') {
    return {
      ...base,
      mode: 'clear',
      weatherName: 'Clear skies',
      note: 'Nothing is restricted right now.',
      doors: [],
      gather: null,
    };
  }

  // ---- the three doors ----
  const waited = i.waitLeft == null ? 0 : WAIT_SECONDS - i.waitLeft;
  const waiting = i.waitLeft != null && i.waitLeft > 0;
  const waitDone = i.waitLeft === 0;
  const doors: Door[] = [
    {
      key: 'wait',
      icon: waitDone ? 'check' : 'hourglass',
      title: waiting ? `Breathe… ${mmss(i.waitLeft!)}` : waitDone ? "That's a minute" : `Wait ${WAIT_SECONDS} seconds`,
      sub: waiting ? "The sky's settling. This doesn't add time." : waitDone ? 'Still want it? Close the app, or take a quest.' : "A short pause. Doesn't add time.",
      variant: 'secondary',
      fill: i.waitLeft == null ? 0 : waited / WAIT_SECONDS,
    },
  ];
  // Storm: banked minutes cannot open Restricted apps (the Sealed rule), so there is no umbrella door.
  if (decision.canSpend) {
    doors.push({
      key: 'umbrella',
      icon: 'umbrella',
      title: `Open umbrella — ${SPEND_MINUTES} min`,
      sub: short ? `You need ${cost - i.balance} more minutes` : `Leaves ${i.balance - cost} min for later`,
      variant: short ? 'disabled' : 'primary',
      fill: 0,
    });
  }
  doors.push({
    key: 'quest',
    icon: 'sparkles',
    title: 'Take a quest',
    sub: storm ? 'Fastest: 25 min phone-down pays 15 min' : 'Walk, focus or meet up to earn time',
    // The quest is the way out when you are in a Storm or cannot afford the umbrella.
    variant: decision.questPrimary || short ? 'primary' : 'secondary',
    fill: 0,
  });

  return {
    ...base,
    mode: storm ? 'storm' : 'cloudy',
    weatherName: storm ? 'Storm' : 'Cloudy',
    note: i.trigger === 'expired' ? 'Your umbrella time just ran out.' : null,
    doors,
    gather,
  };
}

/** The full-screen moment after an umbrella opens or the emergency unlock is used. */
export type OpenedInput =
  | { kind: 'umbrella'; appName: string | null; balanceAfter: number }
  | { kind: 'emergency'; appName: string | null; pickUpAt: string | null };

export function openedViewModel(i: OpenedInput) {
  const app = i.appName ?? 'your app';
  return i.kind === 'umbrella'
    ? {
        weather: 'metered' as Posture,
        icon: 'umbrella' as IconName,
        title: `Umbrella up: ${SPEND_MINUTES} minutes.`,
        sub: `${i.balanceAfter} min of umbrella time left after this one.`,
        button: `Open ${app}`,
      }
    : {
        weather: 'open' as Posture,
        icon: 'sun' as IconName,
        title: `Everything’s open for ${SPEND_MINUTES} minutes.`,
        sub: i.pickUpAt ? `The weather picks up again at ${i.pickUpAt}.` : 'The weather picks up again afterwards.',
        button: `Open ${app}`,
      };
}

/** Emergency unlock is two taps plus a confirm: this is the tiny state machine behind that. */
export type EmergencyStep = 'idle' | 'armed' | 'confirming' | 'done';

export function nextEmergencyStep(step: EmergencyStep, action: 'tap' | 'confirm' | 'cancel'): EmergencyStep {
  if (action === 'cancel') return step === 'done' ? 'done' : 'idle';
  if (step === 'idle' && action === 'tap') return 'armed'; // tap 1: the link
  if (step === 'armed' && action === 'tap') return 'confirming'; // tap 2: "Unlock 15 min"
  if (step === 'confirming' && action === 'confirm') return 'done'; // confirm dialog
  return step;
}
