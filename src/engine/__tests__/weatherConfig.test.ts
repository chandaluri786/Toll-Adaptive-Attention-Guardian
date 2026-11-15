// OWNER: C (task C3). The weather thresholds Settings (C7) edits live, stored behind the KV port.
import { createMemoryKV } from '../kv';
import { METERED_AT, SEALED_AT } from '../scoring';
import { createWeatherConfig, DEFAULT_WEATHER, EXIT_GAP, WEATHER_KEY, validateWeather } from '../weatherConfig';

describe('DEFAULT_WEATHER', () => {
  it('comes from the planning doc: Cloudy 35, Storm 65, leave 5 below', () => {
    expect(DEFAULT_WEATHER).toEqual({ cloudyAt: 35, stormAt: 65, exitGap: 5 });
    expect(DEFAULT_WEATHER.cloudyAt).toBe(METERED_AT);
    expect(DEFAULT_WEATHER.stormAt).toBe(SEALED_AT);
    expect(EXIT_GAP).toBe(5);
  });
});

describe('validateWeather', () => {
  it('accepts the default', () => {
    expect(validateWeather(DEFAULT_WEATHER)).toEqual({ ok: true, config: DEFAULT_WEATHER });
  });

  it.each([
    ['Storm at or below Cloudy', { cloudyAt: 50, stormAt: 50, exitGap: 5 }],
    ['Storm above 100', { cloudyAt: 35, stormAt: 101, exitGap: 5 }],
    ['Cloudy at 0', { cloudyAt: 0, stormAt: 65, exitGap: 0 }],
    ['a gap as wide as Cloudy', { cloudyAt: 10, stormAt: 65, exitGap: 10 }],
    ['leaving Storm below the Cloudy line', { cloudyAt: 35, stormAt: 40, exitGap: 10 }],
    ['a fraction', { cloudyAt: 35.5, stormAt: 65, exitGap: 5 }],
    ['not a number', { cloudyAt: '35', stormAt: 65, exitGap: 5 }],
    ['a negative gap', { cloudyAt: 35, stormAt: 65, exitGap: -1 }],
  ])('refuses %s', (_name, input) => {
    const result = validateWeather(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('refuses null and non-objects', () => {
    expect(validateWeather(null).ok).toBe(false);
    expect(validateWeather('35').ok).toBe(false);
  });
});

describe('createWeatherConfig', () => {
  it('starts at the default with nothing stored', () => {
    const store = createWeatherConfig({ kv: createMemoryKV() });
    expect(store.get()).toEqual(DEFAULT_WEATHER);
  });

  it('set merges a partial edit, persists it under engine: and notifies subscribers', () => {
    const kv = createMemoryKV();
    const store = createWeatherConfig({ kv });
    const seen: unknown[] = [];
    store.subscribe((c) => seen.push(c));
    const before = store.get();

    const result = store.set({ stormAt: 55 });

    expect(result).toEqual({ ok: true, config: { cloudyAt: 35, stormAt: 55, exitGap: 5 } });
    expect(store.get()).toEqual({ cloudyAt: 35, stormAt: 55, exitGap: 5 });
    expect(before).toEqual(DEFAULT_WEATHER); // old object untouched
    expect(seen).toEqual([{ cloudyAt: 35, stormAt: 55, exitGap: 5 }]);
    expect(kv.keys()).toEqual([`engine:${WEATHER_KEY}`]);
    expect(createWeatherConfig({ kv }).get()).toEqual({ cloudyAt: 35, stormAt: 55, exitGap: 5 });
  });

  it('a bad edit changes nothing and notifies nobody', () => {
    const store = createWeatherConfig({ kv: createMemoryKV() });
    const fn = jest.fn();
    store.subscribe(fn);
    const result = store.set({ stormAt: 20 });
    expect(result.ok).toBe(false);
    expect(store.get()).toEqual(DEFAULT_WEATHER);
    expect(fn).not.toHaveBeenCalled();
  });

  it('corrupt or invalid storage falls back to the default', () => {
    const kv = createMemoryKV();
    kv.set(WEATHER_KEY, '{not json');
    expect(createWeatherConfig({ kv }).get()).toEqual(DEFAULT_WEATHER);
    kv.set(WEATHER_KEY, JSON.stringify({ cloudyAt: 90, stormAt: 10, exitGap: 5 }));
    expect(createWeatherConfig({ kv }).get()).toEqual(DEFAULT_WEATHER);
  });

  it('reset goes back to the default, clears storage and notifies', () => {
    const kv = createMemoryKV();
    const store = createWeatherConfig({ kv });
    store.set({ cloudyAt: 40 });
    const fn = jest.fn();
    store.subscribe(fn);
    store.reset();
    expect(store.get()).toEqual(DEFAULT_WEATHER);
    expect(kv.keys()).toEqual([]);
    expect(fn).toHaveBeenCalledWith(DEFAULT_WEATHER);
  });

  it('unsubscribe stops notifications', () => {
    const store = createWeatherConfig({ kv: createMemoryKV() });
    const fn = jest.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.set({ cloudyAt: 40 });
    expect(fn).not.toHaveBeenCalled();
  });
});
