// OWNER: C (task C2). Builds Signals on each tick from A's UsageFeed, B's Planner and
// Quests.onVerified — reached only through get(), never by importing src/day or src/device.
// Missing services (late wiring, a feed that isn't up yet) count as 0.
import type { Clock, ForegroundSample, GetServices, Posture, Signals, Unsub } from '../contracts';
import { MIN } from '../shared/emitter';
import { baseFor, deficitFor, type BaseSource } from './base';
import type { FreeTime } from './freeTime';
import { WIN_WINDOW_MIN } from './scoring';

/** A's feed sends one foreground sample a second: each Restricted sample is one second of use. */
export const SAMPLE_MS = 1000;
export const SCROLL_WINDOW_MIN = 60;
export const URGE_WINDOW_MS = 15 * MIN;

export type SignalsSnapshot = {
  signals: Signals;
  /** Where the base came from, for the reason string. */
  source: BaseSource;
  /** Minutes the last win minted ("Nice — 25 minutes of umbrella time"), null if no recent win. */
  winMinutes: number | null;
};

export type SignalsBuilder = {
  /** Subscribe to the feeds (idempotent). Call once services are wired. */
  start(): void;
  stop(): void;
  build(now?: number): SignalsSnapshot;
  /** Forget scrolling, urges and wins (free time has its own reset). */
  reset(): void;
};

export type SignalsDeps = {
  get: GetServices;
  clock: Clock;
  freeTime: FreeTime;
  /** The current weather; Restricted use during a storm does not count against free time. */
  posture?: () => Posture;
};

/** Seconds of Restricted use per clock minute (at most ~61 entries kept). */
type Bucket = { minute: number; seconds: number };
type Intercept = { at: number; pkg: string };
type Win = { at: number; minutes: number };

const minuteOf = (t: number) => Math.floor(t / MIN);

function addSecond(buckets: readonly Bucket[], at: number): Bucket[] {
  const minute = minuteOf(at);
  const oldest = minute - SCROLL_WINDOW_MIN;
  const kept = buckets.filter((b) => b.minute > oldest);
  const hit = kept.find((b) => b.minute === minute);
  if (!hit) return [...kept, { minute, seconds: 1 }];
  return kept.map((b) => (b === hit ? { minute, seconds: b.seconds + 1 } : b));
}

function scrollMinutes(buckets: readonly Bucket[], now: number): number {
  const oldest = minuteOf(now) - SCROLL_WINDOW_MIN;
  const seconds = buckets.filter((b) => b.minute > oldest && b.minute <= minuteOf(now)).reduce((n, b) => n + b.seconds, 0);
  return seconds / 60;
}

function maxOpensOfOneApp(intercepts: readonly Intercept[], now: number): number {
  const counts = new Map<string, number>();
  for (const i of intercepts) {
    if (i.at > now - URGE_WINDOW_MS && i.at <= now) counts.set(i.pkg, (counts.get(i.pkg) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export function createSignalsBuilder({ get, clock, freeTime, posture = () => 'open' }: SignalsDeps): SignalsBuilder {
  let buckets: readonly Bucket[] = [];
  let intercepts: readonly Intercept[] = [];
  let lastWin: Win | null = null;
  let unsubs: Unsub[] = [];

  const onSample = (s: ForegroundSample) => {
    if (s.appClass !== 'restricted') return;
    buckets = addSecond(buckets, s.at);
    if (posture() !== 'sealed') freeTime.use(SAMPLE_MS);
  };

  const onIntercept = (s: ForegroundSample) => {
    intercepts = [...intercepts.filter((i) => i.at > s.at - URGE_WINDOW_MS), { at: s.at, pkg: s.pkg }];
  };

  return {
    start() {
      if (unsubs.length > 0) return;
      const { usageFeed, quests } = get();
      unsubs = [
        usageFeed?.onSample(onSample),
        usageFeed?.onIntercept(onIntercept),
        quests?.onVerified((_q, v, minted) => {
          if (v.pass) lastWin = { at: clock.now(), minutes: minted };
        }),
      ].filter((u): u is Unsub => typeof u === 'function');
    },
    stop() {
      unsubs.forEach((u) => u());
      unsubs = [];
    },
    build(now = clock.now()) {
      const planner = get().planner;
      const sleepWindow = planner?.sleepWindow();
      const { baseScore, source } = baseFor(now, planner?.currentBlock(now) ?? null, sleepWindow);
      const sinceWin = lastWin ? Math.floor((now - lastWin.at) / MIN) : null;
      const winRecent = sinceWin !== null && sinceWin >= 0 && sinceWin < WIN_WINDOW_MIN;
      const signals: Signals = {
        baseScore,
        deficit: deficitFor(now, planner?.progress(), sleepWindow),
        scrollMinutes60: scrollMinutes(buckets, now),
        urgeCount15: maxOpensOfOneApp(intercepts, now),
        minutesSinceWin: winRecent ? sinceWin : null,
        allowanceLeftMin: freeTime.leftMin(),
      };
      return { signals, source, winMinutes: winRecent && lastWin ? lastWin.minutes : null };
    },
    reset() {
      buckets = [];
      intercepts = [];
      lastWin = null;
    },
  };
}
