// OWNER: A after hour 0 (src/ui). The ONE place internal posture names become user-facing weather.
// Users never see "posture", "open", "metered" or "sealed".
import type { Posture } from '../contracts';

export type WeatherInfo = {
  name: 'Clear skies' | 'Cloudy' | 'Storm';
  word: string; // short chip label
  icon: string; // placeholder glyph until the design's icons land (A12)
  paletteKey: 'clear' | 'cloudy' | 'storm';
};

export const WEATHER: Record<Posture, WeatherInfo> = {
  open: { name: 'Clear skies', word: 'Clear', icon: '☀', paletteKey: 'clear' },
  metered: { name: 'Cloudy', word: 'Cloudy', icon: '☁', paletteKey: 'cloudy' },
  sealed: { name: 'Storm', word: 'Storm', icon: '⛈', paletteKey: 'storm' },
};

export const weatherFor = (p: Posture): WeatherInfo => WEATHER[p];
