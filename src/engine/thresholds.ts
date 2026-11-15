// OWNER: C (task C7). The logic behind Settings' weather thresholds (design 7.1, 7.3): stepping a
// threshold through weatherConfig's validation, the Focus Pressure meter, and the design's copy.
// Kept out of React so it is tested directly; EngineSection only renders it.
import { createMemoryKV } from './kv';
import { createWeatherConfig, validateWeather, type WeatherConfig, type WeatherConfigStore, type WeatherResult } from './weatherConfig';

export const THRESHOLD_STEP = 1;

/** Design 7.3, word for word. */
export const COPY = {
  title: 'Weather thresholds',
  intro: 'Shown on purpose. This is exactly how the sky decides, and you can change it.',
  pressureNow: 'Focus Pressure right now',
  explainer:
    'Rises with quick app-switching and long scrolls. Falls when the phone is down. Only counts after free time runs out.',
  nextReading: 'The sky checks again within a minute.',
} as const;

export type ThresholdField = 'cloudyAt' | 'stormAt';

/** One press of − or +. Refused (with the validator's calm sentence) when the result is invalid. */
export function stepThreshold(config: WeatherConfig, field: ThresholdField, delta: number): WeatherResult {
  return validateWeather({ ...config, [field]: config[field] + delta });
}

/** Apply a step to the live store; the engine picks it up on its next reading. */
export function applyStep(store: WeatherConfigStore, field: ThresholdField, delta: number): WeatherResult {
  const next = stepThreshold(store.get(), field, delta);
  return next.ok ? store.set({ [field]: next.config[field] }) : next;
}

const pct = (n: number) => Math.min(Math.max(Math.round(n), 0), 100);

export type PressureMeter = { score: number; fillPct: number; cloudyPct: number; stormPct: number };

/** The bar in 7.3: fill to the score, a mark at each threshold, all 0–100. */
export function pressureMeter(score: number, config: WeatherConfig): PressureMeter {
  const s = Number.isFinite(score) ? pct(score) : 0;
  return { score: s, fillPct: s, cloudyPct: pct(config.cloudyAt), stormPct: pct(config.stormAt) };
}

/** 120 → "2 h", 90 → "1 h 30 min", 45 → "45 min". */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** The Settings row's subtitle (7.1): "Cloudy at pressure 35 · 2 h free". */
export function thresholdSummary(config: WeatherConfig, freeMinPerDay: number): string {
  return `Cloudy at pressure ${config.cloudyAt} · ${formatDuration(freeMinPerDay)} free`;
}

let practice: WeatherConfigStore | null = null;

/**
 * The fake engine has no thresholds; Settings then edits an in-memory copy so the screen still
 * works before the flip (the fake's weather only follows the demo panel).
 */
export function weatherStoreOr(store: WeatherConfigStore | undefined): { store: WeatherConfigStore; isPractice: boolean } {
  if (store) return { store, isPractice: false };
  practice = practice ?? createWeatherConfig({ kv: createMemoryKV() });
  return { store: practice, isPractice: true };
}
