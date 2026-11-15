// OWNER: A after hour 0 (src/ui). The ONE place internal posture names become user-facing weather.
// Users never see "posture", "open", "metered" or "sealed". Mirrors the design's weather map.
import type { Posture } from '../contracts';

export type IconName = 'sun' | 'moon' | 'cloud' | 'cloud-moon' | 'cloud-lightning';

export type WeatherInfo = {
  name: 'Clear skies' | 'Cloudy' | 'Storm';
  word: 'Clear' | 'Cloudy' | 'Storm'; // short chip label
  icon: IconName;
  nightIcon: IconName; // Clear skies turns into a moon at night
};

export const WEATHER: Record<Posture, WeatherInfo> = {
  open: { name: 'Clear skies', word: 'Clear', icon: 'sun', nightIcon: 'moon' },
  metered: { name: 'Cloudy', word: 'Cloudy', icon: 'cloud', nightIcon: 'cloud-moon' },
  sealed: { name: 'Storm', word: 'Storm', icon: 'cloud-lightning', nightIcon: 'cloud-lightning' },
};

export const weatherFor = (p: Posture): WeatherInfo => WEATHER[p];

/** The icon for a weather in the given theme. As in the design, only Clear skies turns into a moon at night. */
export const weatherIcon = (p: Posture, dark: boolean): IconName => (dark && p === 'open' ? WEATHER[p].nightIcon : WEATHER[p].icon);
