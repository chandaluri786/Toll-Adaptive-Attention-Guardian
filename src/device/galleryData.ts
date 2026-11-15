// OWNER: A (Spec A). Sample data for the state gallery (screens/Gallery.tsx). Everything here is built by
// the REAL logic (view models, forecast model, enforcement planner, notification router) fed with fake
// inputs, so the gallery shows what the code actually produces, not hand-written mock-ups.
import type { AccessWindow, Block, PostureState, Quest, Verdict } from '../contracts';
import services from '../services';
import { MIN, createEmitter } from '../shared/emitter';
import { planEnforcement, type EnforcementPlan } from './enforcer';
import { FAKE_APPS, createFakeNotifier } from './fakePorts';
import { forecastModel, historyNeeded, type ForecastModel, type Range } from './forecast';
import { createNotificationRouter, persistentBody } from './notifications';
import type { AppClassification } from './policy';
import type { Notice } from './ports';
import { createMemoryStore } from './storage';
import { openedViewModel, stormViewModel, type EmergencyStep, type StormInput, type StormViewModel } from './stormViewModel';

/** A fixed "now" (Sunday 15 Nov 2026, 10:00) so the gallery looks the same on every load. */
export const GALLERY_NOW = new Date(2026, 10, 15, 10, 0, 0, 0).getTime();

// ---- Storm / Cloud screen (design section 1) --------------------------------------------------------

const CLOUDY: StormInput = {
  posture: 'metered',
  reason: "Cloudy until 14:00 — free time's used up.",
  grace: false,
  appName: 'Scrollr',
  trigger: 'opened',
  balance: 18,
  emergencyLeft: 1,
  clearsAt: '14:00',
};
const STORM: StormInput = { ...CLOUDY, posture: 'sealed', reason: "Storm until 11:00 — you're in Algorithms.", clearsAt: '11:00', balance: 4 };

export type StormSample = {
  id: string;
  label: string;
  posture: StormInput['posture'];
  vm: StormViewModel;
  emergencyStep: EmergencyStep;
  opened: ReturnType<typeof openedViewModel> | null;
};

const sample = (id: string, label: string, input: StormInput, extra: Partial<StormSample> = {}): StormSample => ({
  id,
  label,
  posture: input.posture,
  vm: stormViewModel(input),
  emergencyStep: 'idle',
  opened: null,
  ...extra,
});

export const STORM_SAMPLES: StormSample[] = [
  sample('cloudy', '1.1 Cloudy, with umbrella time', CLOUDY),
  sample('cloudy-short', '1.2 Cloudy, not enough umbrella time', { ...CLOUDY, balance: 9 }),
  sample('storm', '1.3 Storm', STORM),
  sample('waiting', '1.4 Storm, waiting (the sky settles)', { ...STORM, waitLeft: 37 }),
  sample('wait-done', '1.4b After a minute', { ...STORM, waitLeft: 0 }),
  sample('emergency-tap', '1.5 Emergency unlock: tap', STORM, { emergencyStep: 'armed' }),
  sample('emergency-confirm', '1.5 Emergency unlock: confirm', STORM, { emergencyStep: 'confirming' }),
  sample('emergency-used', '1.6 Emergency already used', { ...STORM, emergencyLeft: 0, emergencyUsedAt: '08:12' }),
  sample('opened', '1.7 Umbrella opened', CLOUDY, { opened: openedViewModel({ kind: 'umbrella', appName: 'Scrollr', balanceAfter: 3 }) }),
  sample('opened-emergency', '1.7b Emergency unlock opened', STORM, { opened: openedViewModel({ kind: 'emergency', appName: 'Scrollr', pickUpAt: '10:29' }) }),
  sample('gathering', '1.8 Clouds gathering (90 s warning)', { ...CLOUDY, posture: 'open', grace: true, graceLeft: 83, reason: 'Storm at 10:00 — Algorithms. Nothing changes until then.' }),
];

// ---- Forecast (design section 5) --------------------------------------------------------------------

// History comes from the ledger through the contract (never from C's folder directly). On fakes it is 180
// deterministic days; after integration the gallery shows the real ledger's history instead.
export function forecastSample(range: Range): ForecastModel {
  return forecastModel(range, services.ledger.history(historyNeeded(range)));
}
export const forecastEmpty = (): ForecastModel => forecastModel('week', services.ledger.history(1));

// ---- Notifications (design section 8), produced by the real router ----------------------------------

const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m).getTime();

/** Runs the real notification router through one scripted day and returns what it sent, oldest first. */
export function sampleNotices(): Notice[] {
  let now = at(7, 30);
  let state: PostureState = { posture: 'open', score: 0, reason: "Sky's clear. Enjoy it.", reasonCode: 'none', nextChange: null, grace: false, allowanceLeftMin: 120, computedAt: 1 };
  let balance = 30;
  let reminder: 'morning' | 'noon' | null = 'morning';
  let next: Block | null = null;
  const ticks = createEmitter<number>();
  const posture = createEmitter<void>();
  const ledger = createEmitter<void>();
  const verified = createEmitter<{ q: Quest; v: Verdict; m: number }>();
  const notifier = createFakeNotifier();

  const router = createNotificationRouter({
    clock: { now: () => now, onTick: (fn) => ticks.on(fn) },
    posture: { get: () => state, subscribe: (fn) => posture.on(() => fn(state)) },
    ledger: { balance: () => balance, onChange: (fn) => ledger.on(() => fn()) },
    planner: { remindersDue: () => reminder, nextBlock: () => next },
    quests: { onVerified: (fn) => verified.on(({ q, v, m }) => fn(q, v, m)) },
    notifier,
    store: createMemoryStore(),
  });
  router.start();

  ticks.emit(now); // 07:30 morning reminder
  now = at(9, 50);
  reminder = null;
  next = { type: 'class', title: 'Algorithms', start: at(10), end: at(11) };
  ticks.emit(now); // 09:50 block warning
  now = at(12, 0);
  reminder = 'noon';
  ticks.emit(now); // 12:00 "nothing planned"
  now = at(12, 31);
  state = { ...state, posture: 'metered', reason: "Cloudy until 14:00 — free time's used up.", allowanceLeftMin: 0, computedAt: 2 };
  posture.emit(); // weather change + free time used
  now = at(12, 40);
  balance = 43;
  verified.emit({ q: { type: 'fitness' } as Quest, v: { pass: true } as Verdict, m: 25 }); // quest verified
  now = at(13, 5);
  balance = 4;
  ledger.emit(); // umbrella low
  return notifier.log;
}

/** The ongoing (persistent) notification, as the router writes it for the foreground service. */
export const persistentSample = {
  title: 'Cloudy · umbrella 18 min',
  body: persistentBody({ allowanceLeftMin: 0, nextChange: { at: at(14), to: 'open' } }),
};

// ---- What the blocker is told, per situation --------------------------------------------------------

const config: AppClassification = {
  restricted: new Set(['com.instagram.android', 'com.zhiliaoapp.musically', 'com.reddit.frontpage']),
  alwaysOpen: new Set(['com.whatsapp']),
  discretionary: new Set(),
};
const installed = FAKE_APPS.map((a) => a.pkg);
const nameOf = (pkg: string) => FAKE_APPS.find((a) => a.pkg === pkg)?.name ?? pkg;
const questWindow = (minutes: number): AccessWindow => ({ id: 'w', scope: 'restricted', until: GALLERY_NOW + minutes * MIN, source: 'quest' });

export type EnforcementRow = { situation: string; plan: EnforcementPlan; summary: string };

export function enforcementRows(): EnforcementRow[] {
  const base = { now: GALLERY_NOW, config, installed, windows: [] as AccessWindow[], failOpen: null };
  const summarize = (p: EnforcementPlan): string => {
    switch (p.mode) {
      case 'off':
        return `Nothing is blocked (${p.reason.replace('_', ' ')})`;
      case 'metering':
        return `Not blocking; measuring use of ${p.blocklist.map(nameOf).join(', ')}`;
      case 'blocking':
        return `Blocking ${p.blocklist.map(nameOf).join(', ')}`;
      case 'window':
        return `Window open for ${p.unlockMinutes} min; would block ${p.blocklist.map(nameOf).join(', ')}`;
    }
  };
  const rows: [string, Parameters<typeof planEnforcement>[0]][] = [
    ['Clear skies', { ...base, posture: 'open' }],
    ['Cloudy', { ...base, posture: 'metered' }],
    ['Storm', { ...base, posture: 'sealed' }],
    ['Storm, quest just passed (25 min)', { ...base, posture: 'sealed', windows: [questWindow(25)] }],
    ['Storm, but the engine went silent', { ...base, posture: 'sealed', failOpen: 'engine_silent' }],
    ['Storm, but overlay permission was revoked', { ...base, posture: 'sealed', failOpen: 'permission_revoked' }],
  ];
  return rows.map(([situation, input]) => {
    const plan = planEnforcement(input);
    return { situation, plan, summary: summarize(plan) };
  });
}

export const GALLERY_PERMISSIONS = { usage: true, overlay: true, notifications: true, location: false, camera: false, motion: false };
export const GALLERY_RESTRICTED = ['com.instagram.android', 'com.zhiliaoapp.musically', 'com.reddit.frontpage', 'com.snapchat.android'];
export const GALLERY_PENDING = { 'com.reddit.frontpage': GALLERY_NOW + 11 * 60 * MIN + 42 * MIN };
