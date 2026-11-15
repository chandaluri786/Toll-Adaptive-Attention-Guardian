// OWNER: C (task C3). The weather thresholds: where Cloudy and Storm begin and how far below
// the line the score must fall to leave them. Settings (C7) edits these live on stage, so they
// sit behind the KV port (`engine:weatherThresholds`) with a setter and subscribe.
import type { Unsub } from '../contracts';
import { createEmitter } from '../shared/emitter';
import { readJson, type KV } from './kv';
import { METERED_AT, SEALED_AT } from './scoring';

/** Planning doc, "The enter/exit asymmetry": leave a stricter weather 5 points below its line. */
export const EXIT_GAP = 5;
export const WEATHER_KEY = 'weatherThresholds';
const MAX_SCORE = 100;
const MAX_EXIT_GAP = 20;

export type WeatherConfig = {
  /** Score that brings clouds in (enter Cloudy). */
  cloudyAt: number;
  /** Score that brings a storm (enter Storm, inside a declared block only). */
  stormAt: number;
  /** Leave Cloudy below cloudyAt − exitGap, Storm below stormAt − exitGap. */
  exitGap: number;
};

export const DEFAULT_WEATHER: WeatherConfig = Object.freeze({ cloudyAt: METERED_AT, stormAt: SEALED_AT, exitGap: EXIT_GAP });

export type WeatherResult = { ok: true; config: WeatherConfig } | { ok: false; error: string };

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

/** Never trust an edit or storage: whole numbers, Cloudy below Storm, and leaving Storm stays at or above the Cloudy line. */
export function validateWeather(input: unknown): WeatherResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Thresholds are missing.' };
  const { cloudyAt, stormAt, exitGap } = input as Record<string, unknown>;
  if (!isInt(cloudyAt) || !isInt(stormAt) || !isInt(exitGap)) return { ok: false, error: 'Thresholds must be whole numbers.' };
  if (cloudyAt < 1 || stormAt > MAX_SCORE) return { ok: false, error: 'Thresholds must sit between 1 and 100.' };
  if (stormAt <= cloudyAt) return { ok: false, error: 'Storm has to start above Cloudy.' };
  if (exitGap < 0 || exitGap > MAX_EXIT_GAP) return { ok: false, error: 'The gap must be 0 to 20 points.' };
  if (exitGap >= cloudyAt) return { ok: false, error: 'The gap must be smaller than the Cloudy line.' };
  if (stormAt - exitGap < cloudyAt) return { ok: false, error: 'Leaving Storm must stay at or above the Cloudy line.' };
  return { ok: true, config: { cloudyAt, stormAt, exitGap } };
}

export type WeatherConfigStore = {
  get(): WeatherConfig;
  /** Merge a partial edit; refused (and nothing changes) when the result is invalid. */
  set(patch: Partial<WeatherConfig>): WeatherResult;
  subscribe(fn: (c: WeatherConfig) => void): Unsub;
  /** Back to the planning-doc default; clears storage. */
  reset(): void;
};

export function createWeatherConfig({ kv }: { kv: KV }): WeatherConfigStore {
  const stored = validateWeather(readJson(kv, WEATHER_KEY));
  let config: WeatherConfig = stored.ok ? stored.config : DEFAULT_WEATHER;
  const changes = createEmitter<WeatherConfig>();

  return {
    get: () => config,
    set(patch) {
      const result = validateWeather({ ...config, ...patch });
      if (!result.ok) return result;
      config = result.config;
      kv.set(WEATHER_KEY, JSON.stringify(config));
      changes.emit(config);
      return result;
    },
    subscribe: (fn) => changes.on(fn),
    reset() {
      config = DEFAULT_WEATHER;
      kv.remove(WEATHER_KEY);
      changes.emit(config);
    },
  };
}
