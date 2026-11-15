// OWNER: C (task C3). createPostureEngine composes clock → signals → score → transitions → PostureState.
// Driven by a hand clock and a hand-set signals snapshot, so no feeds or natives are involved.
import type { Block, PostureState, Signals } from '../../contracts';
import { createEmitter, MIN } from '../../shared/emitter';
import type { BaseSource } from '../base';
import { createMemoryKV } from '../kv';
import { createPostureEngine } from '../postureEngine';
import type { SignalsSnapshot } from '../signals';
import { GRACE_MS } from '../transitions';
import { createWeatherConfig } from '../weatherConfig';

const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 15, h, m, s).getTime();
const algorithms: Block = { type: 'class', title: 'Algorithms', start: at(10), end: at(11) };

const FREE: Signals = { baseScore: 0, deficit: 0, scrollMinutes60: 0, urgeCount15: 0, minutesSinceWin: null, allowanceLeftMin: 120 };
const NONE: BaseSource = { kind: 'none' };

function harness(start: number) {
  let now = start;
  const ticks = createEmitter<number>();
  const clock = { now: () => now, onTick: (fn: (t: number) => void) => ticks.on(fn) };
  let snap: SignalsSnapshot = { signals: FREE, source: NONE, winMinutes: null };
  const config = createWeatherConfig({ kv: createMemoryKV() });
  const engine = createPostureEngine({ clock, snapshot: () => snap, config, monotonic: () => now + 1 });
  const seen: PostureState[] = [];
  engine.subscribe((s) => seen.push(s));
  return {
    engine,
    config,
    seen,
    ticks,
    setNow: (t: number) => (now = t),
    setSnap: (s: Partial<SignalsSnapshot>) => (snap = { ...snap, ...s }),
    /** Move the clock one minute and tick. */
    tick: () => {
      now += MIN;
      ticks.emit(now);
    },
  };
}
const inClass = { signals: { ...FREE, baseScore: 65 }, source: { kind: 'block', block: algorithms } as BaseSource };

describe('createPostureEngine', () => {
  it('starts Clear with the sky reason, free time and a monotonic computedAt', () => {
    const h = harness(at(9, 0, 30));
    h.engine.start();
    const s = h.engine.get();
    expect(s).toMatchObject({ posture: 'open', score: 0, reason: "Sky's clear. Enjoy it.", reasonCode: 'none', grace: false });
    expect(s.allowanceLeftMin).toBe(120);
    expect(s.nextChange).toBeNull();
    expect(s.computedAt).toBe(at(9, 0, 30) + 1);
    h.engine.stop();
  });

  it('a class seals after the hold and 90 s of clouds gathering, with the class reason', () => {
    const h = harness(at(9, 59, 30));
    h.engine.start();
    h.setSnap(inClass);
    h.tick(); // 10:00:30, reading 1
    expect(h.engine.get().posture).toBe('open');
    expect(h.engine.get().nextChange).toEqual({ at: at(10, 1, 30) + GRACE_MS, to: 'sealed' });
    h.tick(); // 10:01:30, reading 2 → Storm gathering: Clear still rules for 90 s
    const graced = h.engine.get();
    expect(graced).toMatchObject({ posture: 'open', grace: true, reasonCode: 'schedule' });
    expect(graced.reason).toBe("Storm until 11:00 — you're in Algorithms.");
    expect(graced.nextChange).toEqual({ at: at(10, 1, 30) + GRACE_MS, to: 'sealed' });
    expect(h.engine.enforced()).toBe('open');

    h.setNow(at(10, 3, 0)); // grace over between readings: get() settles it and tells subscribers
    const sealed = h.engine.get();
    expect(sealed.grace).toBe(false);
    expect(h.engine.enforced()).toBe('sealed');
    expect(h.seen.at(-1)).toBe(sealed);
    expect(sealed.nextChange).toEqual({ at: at(11), to: 'open' }); // the class end
  });

  it('get() keeps a stable reference between readings', () => {
    const h = harness(at(9));
    h.engine.start();
    expect(h.engine.get()).toBe(h.engine.get());
  });

  it('never storms outside a block, even with the Storm line edited under the cap', () => {
    const h = harness(at(15));
    h.engine.start();
    h.config.set({ cloudyAt: 20, stormAt: 40 });
    h.setSnap({ signals: { ...FREE, allowanceLeftMin: 0, scrollMinutes60: 45, urgeCount15: 4, deficit: 1 } });
    for (let i = 0; i < 10; i++) h.tick();
    expect(h.engine.get().score).toBe(60);
    expect(h.engine.get().posture).toBe('metered');
    expect(h.seen.some((s) => s.posture === 'sealed')).toBe(false);
  });

  it('editing a threshold in Settings changes the weather on the next reading', () => {
    const h = harness(at(14));
    h.engine.start();
    h.setSnap({ signals: { ...FREE, baseScore: 50 }, source: { kind: 'block', block: { ...algorithms, type: 'deep_work', title: 'Deep work', start: at(14), end: at(16) } } });
    h.tick();
    h.tick();
    h.tick();
    h.tick(); // the 90 s of clouds gathering are over
    expect(h.engine.get().posture).toBe('metered');

    h.config.set({ stormAt: 50 });
    expect(h.engine.get().posture).toBe('metered'); // nothing until the next reading
    h.tick();
    expect(h.engine.get()).toMatchObject({ posture: 'metered', grace: true, nextChange: { to: 'sealed' } });
    expect(h.engine.get().reason).toBe("Storm until 16:00 — you're in Deep work.");
  });

  it('a 62–66 score wave never flaps the weather a subscriber sees', () => {
    const h = harness(at(10));
    h.engine.start();
    for (let i = 0; i < 30; i++) {
      h.setSnap({ ...inClass, signals: { ...FREE, baseScore: i % 2 === 0 ? 62 : 66 } });
      h.tick();
    }
    const flips = h.seen.map((s) => s.posture).filter((p, i, all) => i > 0 && p !== all[i - 1]).length;
    expect(flips).toBe(1); // Clear → Cloudy, once
  });

  it('a win reason shows when the sky clears', () => {
    const h = harness(at(10, 40));
    h.engine.start();
    h.setSnap({ signals: { ...FREE, minutesSinceWin: 5 }, winMinutes: 25 });
    h.tick();
    expect(h.engine.get()).toMatchObject({ posture: 'open', reasonCode: 'win', reason: 'Nice — 25 minutes of umbrella time. Skies are clearing.' });
  });

  it('stop() unsubscribes from the clock; reset() goes back to Clear and notifies', () => {
    const h = harness(at(10));
    h.engine.start();
    h.setSnap(inClass);
    h.tick();
    h.tick();
    expect(h.engine.get()).toMatchObject({ grace: true, nextChange: { to: 'sealed' } });
    h.engine.reset();
    expect(h.engine.get()).toMatchObject({ posture: 'open', grace: false });
    expect(h.seen.at(-1)?.posture).toBe('open');
    h.engine.stop();
    expect(h.ticks.size()).toBe(0);
  });

  it('start() is idempotent', () => {
    const h = harness(at(10));
    h.engine.start();
    h.engine.start();
    expect(h.ticks.size()).toBe(1);
  });
});
