// OWNER: C (task C2). The Signals builder over A's UsageFeed, B's Planner and Quests.onVerified,
// driven through the other folders' hour-0 fakes (test-only imports; engine code reaches them via get()).
// Node built-ins for the boundary check (the project has no @types/node).
declare const require: (id: string) => unknown;
declare const __dirname: string;
type Fs = { readdirSync(p: string): string[]; readFileSync(p: string, enc: 'utf8'): string };
const fs = require('fs') as Fs;
const path = require('path') as { join(...parts: string[]): string };
import type { ForegroundSample, Services, UsageFeed } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter } from '../../shared/emitter';
import { createFakePostureSource } from '../fakes';
import { createFreeTime } from '../freeTime';
import { createMemoryKV } from '../kv';
import { score } from '../scoring';
import { createSignalsBuilder } from '../signals';

/** Local wall time (never UTC), so the suite means the same thing in any TZ. */
const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 10, day, h, m, s).getTime();

function harness(start: number) {
  let now = start;
  const clock = { now: () => now, onTick: () => () => {} };
  const services = { clock } as unknown as Services;
  const get = () => services;
  const postureSource = createFakePostureSource(clock);
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  Object.assign(services, { postureSource, ledger: createFakeLedger(get).services.ledger, ...device.services, ...day.services });
  const freeTime = createFreeTime({ clock, kv: createMemoryKV() });
  const builder = createSignalsBuilder({ get, clock, freeTime, posture: () => postureSource.get().posture });
  builder.start();
  const setNow = (t: number) => (now = t);
  /** One restricted sample a second for `minutes`, ending at `end`. */
  const scroll = (minutes: number, end: number, pkg?: string) => {
    for (let i = minutes * 60; i > 0; i--) {
      setNow(end - i * 1000);
      device.debug.emitSample(pkg);
    }
    setNow(end);
  };
  return { builder, freeTime, device, day, postureSource, setNow, scroll };
}

describe('createSignalsBuilder — worked day through the fakes', () => {
  // The fake plan: Algorithms 10:00–11:00, 5 tasks, 2 done; sleep 23:00–07:00.
  it('09:00 free, free time left → base 0, score 0', () => {
    const h = harness(at(15, 9));
    const { signals } = h.builder.build();
    expect(signals.baseScore).toBe(0);
    expect(signals.allowanceLeftMin).toBe(120);
    expect(score(signals)).toBe(0);
  });

  it('10:00 class starts → base 65 from the current block', () => {
    const h = harness(at(15, 10));
    const { signals, source } = h.builder.build();
    expect(signals.baseScore).toBe(65);
    expect(source).toEqual({ kind: 'block', block: expect.objectContaining({ title: 'Algorithms' }) });
    expect(score(signals)).toBe(65);
  });

  it('10:30 a verified quest takes 15 off; at 11:00 the win still counts', () => {
    const h = harness(at(15, 10, 30));
    h.day.debug.passActive();
    const inClass = h.builder.build();
    expect(inClass.signals.minutesSinceWin).toBe(0);
    expect(inClass.winMinutes).toBe(25); // fitness quest at rate 1
    expect(score(inClass.signals)).toBe(50);
    h.setNow(at(15, 11));
    const after = h.builder.build();
    expect(after.signals.baseScore).toBe(0);
    expect(after.signals.minutesSinceWin).toBe(30);
    expect(score(after.signals)).toBe(0);
    h.setNow(at(15, 11, 31));
    expect(h.builder.build().signals.minutesSinceWin).toBeNull();
  });

  it('15:00 free time used up, 2 of 5 done → deficit 0.10, score 3', () => {
    const h = harness(at(15, 15));
    h.freeTime.setLeft(0);
    const { signals } = h.builder.build();
    expect(signals.deficit).toBeCloseTo(0.1);
    expect(score(signals)).toBe(3);
  });

  it('22:45 wind-down hour, scrolled 25 min, 3 opens in 15 min → 80', () => {
    const h = harness(at(15, 22, 20));
    h.freeTime.setLeft(0);
    h.scroll(25, at(15, 22, 45));
    for (let i = 0; i < 3; i++) h.device.debug.emitIntercept();
    const { signals, source } = h.builder.build();
    expect(signals.baseScore).toBe(40);
    expect(source.kind).toBe('wind_down');
    expect(signals.scrollMinutes60).toBeCloseTo(25, 0);
    expect(signals.urgeCount15).toBe(3);
    expect(score(signals)).toBe(80);
  });

  it('23:40 sleep window, deficit 0, scrolled 45 min → 95', () => {
    const h = harness(at(15, 22, 55));
    h.freeTime.setLeft(0);
    h.scroll(45, at(15, 23, 40));
    const { signals, source } = h.builder.build();
    expect(signals.baseScore).toBe(70);
    expect(signals.deficit).toBe(0);
    expect(source).toEqual({ kind: 'sleep', until: at(16, 7) });
    expect(score(signals)).toBe(95);
  });

  it('with no plan the worst outside sleep is Cloudy (≤ 60)', () => {
    const h = harness(at(15, 10, 15));
    h.day.debug.setPlan(false);
    h.freeTime.setLeft(0);
    h.scroll(50, at(15, 21));
    for (let i = 0; i < 5; i++) h.device.debug.emitIntercept();
    const { signals } = h.builder.build();
    expect(signals.baseScore).toBe(0);
    expect(signals.deficit).toBe(0); // no tasks, no deficit
    expect(score(signals)).toBeLessThanOrEqual(60);
  });
});

describe('createSignalsBuilder — windows and free time', () => {
  it('scrolling only counts the last hour', () => {
    const h = harness(at(15, 13));
    h.scroll(30, at(15, 13, 30));
    h.scroll(5, at(15, 14, 40));
    h.setNow(at(15, 15));
    expect(h.builder.build().signals.scrollMinutes60).toBeCloseTo(5, 0); // 13:00–13:30 has aged out
  });

  it('urges count the most-opened app in the last 15 minutes', () => {
    const h = harness(at(15, 20));
    h.device.debug.emitIntercept('a');
    h.device.debug.emitIntercept('b');
    h.setNow(at(15, 20, 10));
    h.device.debug.emitIntercept('a');
    h.device.debug.emitIntercept('a');
    expect(h.builder.build().signals.urgeCount15).toBe(3);
    h.setNow(at(15, 20, 16));
    expect(h.builder.build().signals.urgeCount15).toBe(2);
  });

  it('Restricted use counts free time down, but not during a storm', () => {
    const h = harness(at(15, 9));
    h.scroll(1, at(15, 9, 1));
    expect(h.freeTime.leftMin()).toBe(119);
    h.postureSource.setPosture('sealed');
    h.scroll(10, at(15, 9, 11));
    expect(h.freeTime.leftMin()).toBe(119);
  });

  it('essential and discretionary samples neither scroll nor use free time', () => {
    const samples = createEmitter<ForegroundSample>();
    const clock = { now: () => at(15, 9), onTick: () => () => {} };
    const freeTime = createFreeTime({ clock, kv: createMemoryKV() });
    const usageFeed: UsageFeed = { onSample: (fn) => samples.on(fn), onIntercept: () => () => {} };
    const b = createSignalsBuilder({ get: () => ({ usageFeed }) as Services, clock, freeTime });
    b.start();
    for (let i = 0; i < 120; i++) {
      samples.emit({ at: at(15, 9) - i * 1000, pkg: 'com.android.dialer', appClass: 'essential' });
      samples.emit({ at: at(15, 9) - i * 1000, pkg: 'com.google.youtube', appClass: 'discretionary' });
    }
    expect(freeTime.leftMin()).toBe(120);
    expect(b.build().signals.scrollMinutes60).toBe(0);
  });

  it('missing services count as 0 (no planner, feed or quests yet)', () => {
    const clock = { now: () => at(15, 12), onTick: () => () => {} };
    const b = createSignalsBuilder({ get: () => ({}) as Services, clock, freeTime: createFreeTime({ clock, kv: createMemoryKV() }) });
    b.start();
    expect(b.build().signals).toEqual({
      baseScore: 0,
      deficit: 0,
      scrollMinutes60: 0,
      urgeCount15: 0,
      minutesSinceWin: null,
      allowanceLeftMin: 120,
    });
  });

  it('stop unsubscribes and reset forgets scrolling, urges and wins', () => {
    const h = harness(at(15, 21));
    h.scroll(1, at(15, 21, 1));
    h.device.debug.emitIntercept();
    h.day.debug.passActive();
    h.builder.reset();
    const cleared = h.builder.build().signals;
    expect([cleared.scrollMinutes60, cleared.urgeCount15, cleared.minutesSinceWin]).toEqual([0, 0, null]);
    h.builder.stop();
    h.device.debug.emitIntercept();
    expect(h.builder.build().signals.urgeCount15).toBe(0);
  });
});

describe('engine boundaries', () => {
  it('engine code never imports src/day or src/device', () => {
    const dir = path.join(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect({ f, bad: /from ['"]\.\.\/(day|device)(\/|['"])/.test(src) }).toEqual({ f, bad: false });
    }
  });
});
