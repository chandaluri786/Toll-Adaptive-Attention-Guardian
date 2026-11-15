// OWNER: A (task A2). The blocker's unlock budget becomes the "restricted app in use" feed.
import type { ForegroundSample } from '../../contracts';
import { createFakeBlocker } from '../fakePorts';
import { RESTRICTED_SAMPLE_PKG, createUsageMeter } from '../usageMeter';

function setup() {
  const blocker = createFakeBlocker();
  const t = 10_000_000;
  const meter = createUsageMeter(blocker, () => t);
  const samples: ForegroundSample[] = [];
  const intercepts: ForegroundSample[] = [];
  meter.feed.onSample((s) => samples.push(s));
  meter.feed.onIntercept((s) => intercepts.push(s));
  return { blocker, meter, samples, intercepts, t };
}

describe('UsageMeter', () => {
  it('emits one sample per second of restricted-app use', () => {
    const { blocker, meter, samples } = setup();
    blocker.temporaryUnlock(1440);
    meter.poll(); // baseline
    blocker.simulateUse(5);
    meter.poll();
    expect(samples).toHaveLength(5);
    expect(samples.every((s) => s.pkg === RESTRICTED_SAMPLE_PKG && s.appClass === 'restricted')).toBe(true);
  });

  it('timestamps run oldest first, one second apart, ending now', () => {
    const { blocker, meter, samples, t } = setup();
    blocker.temporaryUnlock(10);
    meter.poll();
    blocker.simulateUse(3);
    meter.poll();
    expect(samples.map((s) => s.at)).toEqual([t - 2000, t - 1000, t]);
  });

  it('emits nothing while no app is in use', () => {
    const { blocker, meter, samples } = setup();
    blocker.temporaryUnlock(1440);
    meter.poll();
    meter.poll();
    meter.poll();
    expect(samples).toHaveLength(0);
  });

  it('does not count a swapped unlock as usage (rebase)', () => {
    const { blocker, meter, samples } = setup();
    blocker.temporaryUnlock(1440);
    meter.poll();
    // Enforcer replaces the 24 h meter with a 15 min window: remaining jumps from 86400 to 900.
    blocker.temporaryUnlock(15);
    meter.rebase();
    meter.poll();
    expect(samples).toHaveLength(0);
    blocker.simulateUse(2);
    meter.poll();
    expect(samples).toHaveLength(2);
  });

  it('caps a long gap so a sleeping phone cannot flood the engine', () => {
    const { blocker, meter, samples } = setup();
    blocker.temporaryUnlock(1440);
    meter.poll();
    blocker.simulateUse(3600);
    meter.poll();
    expect(samples).toHaveLength(60);
  });

  it('forwards queued intercepts as urges, naming the app', () => {
    const { blocker, meter, intercepts } = setup();
    blocker.simulateIntercept('Instagram', 123);
    blocker.simulateIntercept('Instagram', 456);
    meter.poll();
    expect(intercepts.map((i) => [i.pkg, i.at])).toEqual([['Instagram', 123], ['Instagram', 456]]);
  });
});
