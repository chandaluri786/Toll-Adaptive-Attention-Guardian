// OWNER: C (task C2). Reasons in weather words, from the highest-weighted active signal.
import type { Block, Posture, Signals } from '../../contracts';
import type { BaseSource } from '../base';
import { reasonFor } from '../reasons';

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

const sig = (patch: Partial<Signals> = {}): Signals => ({
  baseScore: 0,
  deficit: 0,
  scrollMinutes60: 0,
  urgeCount15: 0,
  minutesSinceWin: null,
  allowanceLeftMin: 0,
  ...patch,
});

const algorithms: Block = { type: 'class', title: 'Algorithms', start: at(15, 10), end: at(15, 11) };
const none: BaseSource = { kind: 'none' };

describe('reasonFor', () => {
  it('a class storm names the block and when it ends', () => {
    const r = reasonFor({
      posture: 'sealed',
      signals: sig({ baseScore: 65, allowanceLeftMin: 60 }),
      source: { kind: 'block', block: algorithms },
      winMinutes: null,
    });
    expect(r).toEqual({ reason: "Storm until 11:00 — you're in Algorithms.", reasonCode: 'schedule' });
  });

  it('the sleep window storm runs until the end of sleep', () => {
    const r = reasonFor({
      posture: 'sealed',
      signals: sig({ baseScore: 70, scrollMinutes60: 45 }),
      source: { kind: 'sleep', until: at(16, 7) },
      winMinutes: null,
    });
    expect(r).toEqual({ reason: 'Past your wind-down. Storm until 07:00.', reasonCode: 'sleep' });
  });

  it('the hour before bed is a wind-down reason', () => {
    const r = reasonFor({
      posture: 'sealed',
      signals: sig({ baseScore: 40, deficit: 0.58, scrollMinutes60: 25, urgeCount15: 3 }),
      source: { kind: 'wind_down', until: at(16, 7) },
      winMinutes: null,
    });
    expect(r.reasonCode).toBe('wind_down');
    expect(r.reason).toBe('Wind-down hour. Storm until 07:00.');
  });

  it('scrolling outside a block brings clouds', () => {
    const r = reasonFor({ posture: 'metered', signals: sig({ scrollMinutes60: 45.4, urgeCount15: 3 }), source: none, winMinutes: null });
    expect(r).toEqual({ reason: '45 minutes of scrolling in the last hour. Clouds rolling in.', reasonCode: 'scrolling' });
  });

  it('repeated opens and a plan running behind have their own reasons', () => {
    expect(reasonFor({ posture: 'metered', signals: sig({ urgeCount15: 4, deficit: 0.2 }), source: none, winMinutes: null }).reasonCode).toBe('urge');
    expect(reasonFor({ posture: 'metered', signals: sig({ deficit: 1, scrollMinutes60: 25 }), source: none, winMinutes: null }).reasonCode).toBe('deficit');
  });

  it('behaviour is not the reason while free time is left', () => {
    const r = reasonFor({ posture: 'metered', signals: sig({ baseScore: 50, scrollMinutes60: 60, allowanceLeftMin: 10 }), source: { kind: 'block', block: { ...algorithms, type: 'deep_work', title: 'Deep work' } }, winMinutes: null });
    expect(r).toEqual({ reason: "Cloudy until 11:00 — you're in Deep work.", reasonCode: 'schedule' });
  });

  it('a recent win clears the sky', () => {
    const r = reasonFor({ posture: 'open', signals: sig({ minutesSinceWin: 5, allowanceLeftMin: 30 }), source: none, winMinutes: 25 });
    expect(r).toEqual({ reason: 'Nice — 25 minutes of umbrella time. Skies are clearing.', reasonCode: 'win' });
  });

  it('a clear sky with nothing going on', () => {
    expect(reasonFor({ posture: 'open', signals: sig(), source: none, winMinutes: null })).toEqual({
      reason: "Sky's clear. Enjoy it.",
      reasonCode: 'none',
    });
  });

  it('never says posture, blocked or failed, and always uses a weather word', () => {
    const postures: Posture[] = ['open', 'metered', 'sealed'];
    const sources: BaseSource[] = [
      none,
      { kind: 'block', block: algorithms },
      { kind: 'sleep', until: at(16, 7) },
      { kind: 'wind_down', until: at(16, 7) },
    ];
    const signals = [sig(), sig({ baseScore: 65 }), sig({ deficit: 1 }), sig({ scrollMinutes60: 30 }), sig({ urgeCount15: 5 }), sig({ minutesSinceWin: 1 })];
    for (const posture of postures)
      for (const source of sources)
        for (const s of signals)
          for (const winMinutes of [null, 20]) {
            const { reason } = reasonFor({ posture, signals: s, source, winMinutes });
            expect(reason).not.toMatch(/posture|block|fail|sealed|metered/i);
            expect(reason).toMatch(/Storm|Cloud|clear/i);
          }
  });
});
