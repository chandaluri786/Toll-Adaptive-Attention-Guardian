// OWNER: C (task C2). "Explaining itself": every weather change carries a reason built from the
// highest-weighted active signal, in weather words. Never "posture", "blocked" or "failed" on screen.
import type { Posture, ReasonCode, Signals } from '../contracts';
import type { BaseSource } from './base';
import { contributions } from './scoring';
import { formatHm } from './time';

export type ReasonInput = {
  posture: Posture;
  signals: Signals;
  source: BaseSource;
  /** Minutes the recent win minted, if known. */
  winMinutes: number | null;
};
export type Reason = { reason: string; reasonCode: ReasonCode };

const SKY: Record<Exclude<Posture, 'open'>, { until: string; tail: string }> = {
  metered: { until: 'Cloudy', tail: 'Clouds rolling in.' },
  sealed: { until: 'Storm', tail: 'Storm overhead.' },
};

function baseReason(source: BaseSource, posture: Exclude<Posture, 'open'>): Reason | null {
  const sky = SKY[posture];
  switch (source.kind) {
    case 'block':
      return { reason: `${sky.until} until ${formatHm(source.block.end)} — you're in ${source.block.title}.`, reasonCode: 'schedule' };
    case 'sleep':
      return { reason: `Past your wind-down. ${sky.until} until ${formatHm(source.until)}.`, reasonCode: 'sleep' };
    case 'wind_down':
      return posture === 'sealed'
        ? { reason: `Wind-down hour. Storm until ${formatHm(source.until)}.`, reasonCode: 'wind_down' }
        : { reason: `Wind-down hour. ${sky.tail}`, reasonCode: 'wind_down' };
    default:
      return null;
  }
}

function behaviourReason(code: 'deficit' | 'scrolling' | 'urge', s: Signals, posture: Exclude<Posture, 'open'>): Reason {
  const tail = SKY[posture].tail;
  if (code === 'scrolling') {
    return { reason: `${Math.round(s.scrollMinutes60)} minutes of scrolling in the last hour. ${tail}`, reasonCode: 'scrolling' };
  }
  if (code === 'urge') {
    return { reason: `${Math.round(s.urgeCount15)} quick opens in 15 minutes. ${tail}`, reasonCode: 'urge' };
  }
  return { reason: `Your plan's running behind. ${tail}`, reasonCode: 'deficit' };
}

function winReason(winMinutes: number | null): Reason {
  const reason =
    winMinutes !== null && winMinutes > 0
      ? `Nice — ${Math.round(winMinutes)} minutes of umbrella time. Skies are clearing.`
      : 'Nice — quest done. Skies are clearing.';
  return { reason, reasonCode: 'win' };
}

/** The reason for the current weather, from the signal that adds the most points (ties go to the schedule). */
export function reasonFor({ posture, signals, source, winMinutes }: ReasonInput): Reason {
  const c = contributions(signals);
  if (posture === 'open') {
    return c.win < 0 ? winReason(winMinutes) : { reason: "Sky's clear. Enjoy it.", reasonCode: 'none' };
  }
  const ranked = (['scrolling', 'urge', 'deficit'] as const)
    .map((code) => ({ code, points: c[code] }))
    .reduce((best, x) => (x.points > best.points ? x : best));
  const fromBase = c.base > 0 ? baseReason(source, posture) : null;
  if (fromBase && c.base >= ranked.points) return fromBase;
  if (ranked.points > 0) return behaviourReason(ranked.code, signals, posture);
  return fromBase ?? { reason: SKY[posture].tail, reasonCode: 'none' };
}
