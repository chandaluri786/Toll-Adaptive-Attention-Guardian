// OWNER: A after hour 0 (src/ui). Weather tokens from the approved design (state gallery link in
// README). Rule: no red anywhere; Storm is indigo/violet. One accent (umbrella) for earned minutes.
export const palette = {
  light: {
    clear: { sky: '#BFE3FF', sun: '#FFD45C', ink: '#16324F' },
    cloudy: { sky: '#D9D6E8', sun: '#B9B4CF', ink: '#2E2A40' },
    storm: { sky: '#3B2F7A', sun: '#6C5CE7', ink: '#F4F1FF' },
    umbrella: '#00A6A6',
    text: '#1C1B22',
    textMuted: '#5E5B6B',
    surface: '#FFFFFF',
    background: '#F6F5FA',
    border: '#E3E1EC',
  },
  dark: {
    clear: { sky: '#12304D', sun: '#F5C542', ink: '#EAF4FF' },
    cloudy: { sky: '#2A2838', sun: '#7C7699', ink: '#ECEAF5' },
    storm: { sky: '#1A1440', sun: '#8B7CF6', ink: '#F4F1FF' },
    umbrella: '#3DD6D0',
    text: '#F2F1F7',
    textMuted: '#A9A6B8',
    surface: '#1D1B26',
    background: '#121019', // starry-night base
    border: '#2E2B3B',
  },
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
export const radius = { s: 8, m: 14, l: 22, pill: 999 } as const;
export const type = { body: 16, small: 14, title: 22, hero: 48 } as const; // body never below 16
export const touch = { min: 44 } as const;
export const motion = { fast: 150, normal: 300, slow: 600 } as const;

export type ThemeMode = keyof typeof palette;
