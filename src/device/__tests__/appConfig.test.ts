// OWNER: A (task A8). Adding is instant; removing takes 12 hours; at most 2 always-open apps.
import { HOUR } from '../../shared/emitter';
import { REMOVAL_DELAY_MS, createAppConfig } from '../appConfig';
import { createMemoryStore } from '../storage';

function setup() {
  let t = 1_000_000;
  const store = createMemoryStore();
  const config = createAppConfig(store, () => t);
  return { config, store, advance: (ms: number) => (t += ms), now: () => t };
}

describe('distracting-app list', () => {
  it('adding takes effect immediately', () => {
    const { config } = setup();
    config.addRestricted('com.instagram.android');
    expect(config.restricted()).toEqual(['com.instagram.android']);
  });

  it('removing keeps the app on the list for 12 hours', () => {
    const { config, advance, now } = setup();
    config.addRestricted('com.instagram.android');
    const status = config.requestRemoval('com.instagram.android');
    expect(status?.effectiveAt).toBe(now() + REMOVAL_DELAY_MS);

    advance(11 * HOUR + 59 * 60_000);
    expect(config.restricted()).toEqual(['com.instagram.android']); // still gated
    expect(config.pendingRemovals()).toHaveLength(1);

    advance(2 * 60_000); // now past 12 h
    expect(config.restricted()).toEqual([]);
    expect(config.pendingRemovals()).toEqual([]);
  });

  it('asking again does not restart the 12 hours', () => {
    const { config, advance } = setup();
    config.addRestricted('a');
    const first = config.requestRemoval('a')!;
    advance(5 * HOUR);
    expect(config.requestRemoval('a')!.effectiveAt).toBe(first.effectiveAt);
  });

  it('re-adding an app cancels its pending removal', () => {
    const { config, advance } = setup();
    config.addRestricted('a');
    config.requestRemoval('a');
    config.addRestricted('a');
    advance(13 * HOUR);
    expect(config.restricted()).toEqual(['a']);
  });

  it('removing an app that is not on the list does nothing', () => {
    expect(setup().config.requestRemoval('nope')).toBeNull();
  });

  it('survives a restart: state is read back from the store', () => {
    const { config, store, now } = setup();
    config.addRestricted('a');
    config.requestRemoval('a');
    const reopened = createAppConfig(store, now);
    expect(reopened.restricted()).toEqual(['a']);
    expect(reopened.pendingRemovals()).toHaveLength(1);
  });

  it('a corrupted store starts fresh instead of crashing the app', () => {
    const store = createMemoryStore({ 'device:appConfig': '{not json' });
    expect(createAppConfig(store, () => 0).restricted()).toEqual([]);
  });
});

describe('always-open messaging apps', () => {
  it('keeps at most two, however many are sent', () => {
    const { config } = setup();
    expect(config.setAlwaysOpen(['a', 'b', 'c', 'd'])).toEqual(['a', 'b']);
    expect(config.alwaysOpen()).toHaveLength(2);
  });

  it('ignores duplicates and apps already on the distracting list', () => {
    const { config } = setup();
    config.addRestricted('x');
    expect(config.setAlwaysOpen(['a', 'a', 'x'])).toEqual(['a']);
  });

  it('adding an app to the distracting list takes it off the always-open list', () => {
    const { config } = setup();
    config.setAlwaysOpen(['a']);
    config.addRestricted('a');
    expect(config.alwaysOpen()).toEqual([]);
  });
});
