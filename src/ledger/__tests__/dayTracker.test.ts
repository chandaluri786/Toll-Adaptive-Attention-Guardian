// OWNER: C (task C5). The day tracker: engine-side DaySummary inputs, read via get().
import type { Clock, Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakePostureSource } from '../../engine/fakes';
import { createEmitter } from '../../shared/emitter';
import { createDayTracker, DAYS_KEY, EMPTY_DAY } from '../dayTracker';
import { createMemoryKV, type KV } from '../kv';

const at = (day: number, h: number) => new Date(2026, 10, day, h).getTime();

function harness(start: number, kv: KV = createMemoryKV()) {
  let now = start;
  const ticks = createEmitter<number>();
  const clock: Clock = { now: () => now, onTick: (fn) => ticks.on(fn) };
  const services = { clock } as unknown as Services;
  const get = () => services;
  const postureSource = createFakePostureSource(clock);
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  Object.assign(services, { postureSource, ...device.services, ...day.services });
  const tracker = createDayTracker({ get, kv });
  return { tracker, kv, device, day, postureSource, ticks, setNow: (t: number) => (now = t), tick: () => ticks.emit(now) };
}

describe('createDayTracker', () => {
  it('counts only Restricted samples', () => {
    const h = harness(at(15, 14));
    h.tracker.start();
    h.device.debug.emitSample();
    h.device.services.usageFeed.onSample(() => {}); // no-op extra subscriber
    expect(h.tracker.inputsFor('2026-11-15').restrictedSec).toBe(1);
  });

  it("snapshots plan progress on each tick, so a past day keeps that day's numbers", () => {
    const h = harness(at(15, 22));
    h.tracker.start();
    h.tick();
    h.setNow(at(16, 9));
    h.day.debug.seed('no_plan');
    expect(h.tracker.inputsFor('2026-11-15')).toEqual(expect.objectContaining({ tasksPlanned: 5, tasksDone: 2 }));
    expect(h.tracker.inputsFor('2026-11-16')).toEqual(expect.objectContaining({ tasksPlanned: null, tasksDone: 0 }));
  });

  it('persists on tick and reloads after a restart', () => {
    const kv = createMemoryKV();
    const a = harness(at(15, 22), kv);
    a.tracker.start();
    a.postureSource.setPosture('sealed');
    a.tick();
    a.tracker.stop();
    const b = harness(at(15, 23), kv);
    expect(b.tracker.inputsFor('2026-11-14')).toEqual(EMPTY_DAY);
    expect(b.tracker.inputsFor('2026-11-15').stormMin).toBe(1);
  });

  it('start twice subscribes once; stop unsubscribes', () => {
    const h = harness(at(15, 14));
    h.tracker.start();
    h.tracker.start();
    expect(h.ticks.size()).toBe(1);
    h.tracker.stop();
    expect(h.ticks.size()).toBe(0);
  });

  it('corrupt or malformed storage is dropped day by day', () => {
    const kv = createMemoryKV();
    kv.set(DAYS_KEY, JSON.stringify({ '2026-11-14': { ...EMPTY_DAY, stormMin: 4 }, '2026-11-13': { stormMin: -1 } }));
    const h = harness(at(15, 14), kv);
    expect(h.tracker.inputsFor('2026-11-14').stormMin).toBe(4);
    expect(h.tracker.inputsFor('2026-11-13')).toEqual(EMPTY_DAY);
    kv.set(DAYS_KEY, '[[[');
    expect(harness(at(15, 14), kv).tracker.inputsFor('2026-11-14')).toEqual(EMPTY_DAY);
  });

  it('prune keeps only days from the cut-off on', () => {
    const kv = createMemoryKV();
    kv.set(DAYS_KEY, JSON.stringify({ '2026-05-01': { ...EMPTY_DAY, stormMin: 4 }, '2026-11-14': { ...EMPTY_DAY, stormMin: 2 } }));
    const h = harness(at(15, 14), kv);
    h.tracker.prune('2026-05-20');
    expect(h.tracker.inputsFor('2026-05-01')).toEqual(EMPTY_DAY);
    expect(h.tracker.inputsFor('2026-11-14').stormMin).toBe(2);
  });
});
