// OWNER: C (task C7). Settings' weather thresholds: stepping, the meter, copy, and the live edit
// reaching the real engine on its next reading.
import type { Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { MIN } from '../../shared/emitter';
import { createClock } from '../clock';
import { createMemoryKV } from '../kv';
import { createRealEngine } from '../real';
import {
  applyStep,
  COPY,
  formatDuration,
  pressureMeter,
  stepThreshold,
  thresholdSummary,
  weatherStoreOr,
} from '../thresholds';
import { createWeatherConfig, DEFAULT_WEATHER } from '../weatherConfig';

const FORBIDDEN = /posture|\bopen\b|metered|sealed|blocked|failed/i;

describe('stepThreshold', () => {
  test('one step up on Cloudy', () => {
    const r = stepThreshold(DEFAULT_WEATHER, 'cloudyAt', 1);
    expect(r).toEqual({ ok: true, config: { ...DEFAULT_WEATHER, cloudyAt: 36 } });
  });

  test('refuses Cloudy reaching Storm, with a calm sentence', () => {
    // Arrange
    const tight = { cloudyAt: 40, stormAt: 45, exitGap: 5 };

    // Act
    const r = stepThreshold(tight, 'cloudyAt', 1);

    // Assert
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(FORBIDDEN);
  });

  test('refuses Storm past 100', () => {
    const r = stepThreshold({ ...DEFAULT_WEATHER, stormAt: 100 }, 'stormAt', 1);
    expect(r.ok).toBe(false);
  });
});

describe('applyStep', () => {
  test('writes a valid step to the store and leaves it alone when refused', () => {
    // Arrange
    const store = createWeatherConfig({ kv: createMemoryKV() });

    // Act
    const up = applyStep(store, 'stormAt', -1);
    const refused = applyStep({ ...store, get: () => ({ cloudyAt: 1, stormAt: 65, exitGap: 0 }) }, 'cloudyAt', -1);

    // Assert
    expect(up.ok).toBe(true);
    expect(store.get().stormAt).toBe(64);
    expect(refused.ok).toBe(false);
    expect(store.get().cloudyAt).toBe(35);
  });
});

describe('pressureMeter', () => {
  test('fills to the score and marks both lines', () => {
    expect(pressureMeter(34, { cloudyAt: 40, stormAt: 65, exitGap: 5 })).toEqual({
      score: 34,
      fillPct: 34,
      cloudyPct: 40,
      stormPct: 65,
    });
  });

  test.each([
    [-3, 0],
    [140, 100],
    [Number.NaN, 0],
    [34.6, 35],
  ])('keeps score %p inside the bar as %p', (score, expected) => {
    expect(pressureMeter(score, DEFAULT_WEATHER).fillPct).toBe(expected);
  });
});

describe('copy', () => {
  test.each([
    [120, '2 h'],
    [90, '1 h 30 min'],
    [45, '45 min'],
    [0, '0 min'],
  ])('formatDuration(%p) = %p', (min, text) => {
    expect(formatDuration(min)).toBe(text);
  });

  test('summary row reads like the design', () => {
    expect(thresholdSummary({ ...DEFAULT_WEATHER, cloudyAt: 40 }, 120)).toBe('Cloudy at pressure 40 · 2 h free');
  });

  test('the design copy never uses internal words', () => {
    for (const line of Object.values(COPY)) expect(line).not.toMatch(FORBIDDEN);
  });
});

describe('weatherStoreOr', () => {
  test('uses the engine store when it has one', () => {
    const store = createWeatherConfig({ kv: createMemoryKV() });
    expect(weatherStoreOr(store)).toEqual({ store, isPractice: false });
  });

  test('falls back to one shared in-memory store on the fake', () => {
    // Act
    const a = weatherStoreOr(undefined);
    const b = weatherStoreOr(undefined);

    // Assert
    expect(a.isPractice).toBe(true);
    expect(a.store).toBe(b.store);
    expect(a.store.get()).toEqual(DEFAULT_WEATHER);
  });
});

describe('a threshold edit reaches the real engine on its next reading', () => {
  test('evening with free time used up is Cloudy at 35; raising Cloudy to 60 clears the sky on the next tick', () => {
    // Arrange: 22:10, the hour before the default 23:00 bedtime
    let wall = new Date(2026, 10, 16, 22, 10).getTime();
    const clock = createClock({ wallNow: () => wall, monoNow: () => wall, timers: { setInterval: () => 0, clearInterval: () => {} } });
    const services = {} as Services;
    const get = () => services;
    const engine = createRealEngine(get, { kv: createMemoryKV(), clock });
    Object.assign(services, engine.services, createFakeLedger(get).services, createFakeDevice(get).services, createFakeDay(get).services);
    engine.debug.freeTime.setLeft(0);
    services.postureSource.get();
    const minute = () => {
      wall += MIN;
      clock.tick();
    };
    minute();
    minute();
    const before = services.postureSource.get();

    // Act
    const edit = applyStep(engine.debug.weather, 'cloudyAt', 25);
    const sameMoment = services.postureSource.get().posture;
    minute();

    // Assert
    expect(before.posture).toBe('metered');
    expect(before.score).toBeLessThan(55); // below the new Cloudy line minus the exit gap
    expect(edit.ok).toBe(true);
    expect(sameMoment).toBe('metered');
    expect(services.postureSource.get().posture).toBe('open');
  });
});
