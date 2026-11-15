// OWNER: A after hour 0 (src/ui). Design tokens, copied from the approved design's "toll-kit" (the
// palette, sky gradients and fonts of https://claude.ai/artifact/6W9BYCvTubVmr9SMrv143m). See docs/DESIGN.md.
//
// Rules the design follows (planning doc, Visual language): no red anywhere; Storm is indigo and violet;
// one warm gold accent means "umbrella time"; body text never below 16; touch targets at least 44.
import type { Posture } from '../contracts';

export type ThemeMode = 'light' | 'dark';

/** Colours for cards, text and chrome. The sky (behind weather screens) has its own table below. */
export const BASE = {
  light: {
    bg: '#fbf8f3', card: '#ffffff', surface: '#f3efe6', text: '#1d2130', muted: '#565b6c', faint: '#8a8e9c',
    divider: 'rgba(29,33,48,.12)', gold: '#c28d41', goldText: '#7d5411', goldTint: '#fff3e4', goldTintText: '#5a3b0a',
    track: '#ece7dd', free: '#4f9ad6', freeTint: '#e5f1fb', good: '#2f7d6b', goodTint: '#e3f3ee',
    scrim: 'rgba(20,22,40,.42)', shade: '#e8e6ef', primaryBg: '#ffe3bf', primaryText: '#3a270d',
    storm: '#4b3a8f', stormTint: '#ece9f8', cloud: '#7c7a96',
  },
  dark: {
    bg: '#0e1120', card: '#171b2e', surface: '#1f2438', text: '#eef0f8', muted: '#a9aec4', faint: '#7c8199',
    divider: 'rgba(238,240,248,.12)', gold: '#e1ad66', goldText: '#facb8d', goldTint: 'rgba(225,173,102,.14)',
    goldTintText: '#ffe3bf', track: '#272c44', free: '#7cb8ea', freeTint: 'rgba(124,184,234,.14)', good: '#6fcfb5',
    goodTint: 'rgba(111,207,181,.14)', scrim: 'rgba(0,0,0,.55)', shade: '#090b16', primaryBg: '#ffe3bf',
    primaryText: '#3a270d', storm: '#a99af0', stormTint: 'rgba(169,154,240,.14)', cloud: '#a9a7c4',
  },
} as const;

/** The sky behind a weather screen: gradient, text colours on it, and the translucent chip / button fills. */
export type SkyColors = { top: string; bottom: string; on: string; onMuted: string; chip: string; btn: string; btnLine: string };

export const SKY: Record<ThemeMode, Record<Posture, SkyColors>> = {
  light: {
    open: { top: '#7cc8f7', bottom: '#fde9b8', on: '#16243d', onMuted: '#2d3d5a', chip: 'rgba(255,255,255,.72)', btn: 'rgba(255,255,255,.62)', btnLine: 'rgba(22,36,61,.14)' },
    metered: { top: '#aeabcb', bottom: '#e9e6f1', on: '#20203a', onMuted: '#3e3e58', chip: 'rgba(255,255,255,.7)', btn: 'rgba(255,255,255,.6)', btnLine: 'rgba(32,32,58,.14)' },
    sealed: { top: '#221d5c', bottom: '#5a449e', on: '#ffffff', onMuted: '#dcd5f7', chip: 'rgba(255,255,255,.16)', btn: 'rgba(255,255,255,.1)', btnLine: 'rgba(255,255,255,.22)' },
  },
  dark: {
    open: { top: '#0a1433', bottom: '#2b3b70', on: '#f2f4ff', onMuted: '#c6cde9', chip: 'rgba(255,255,255,.12)', btn: 'rgba(255,255,255,.08)', btnLine: 'rgba(255,255,255,.18)' },
    metered: { top: '#1a1a2c', bottom: '#3c3a58', on: '#f0eff8', onMuted: '#c8c6dc', chip: 'rgba(255,255,255,.12)', btn: 'rgba(255,255,255,.08)', btnLine: 'rgba(255,255,255,.18)' },
    sealed: { top: '#0b0826', bottom: '#2b1d5e', on: '#ffffff', onMuted: '#d0c8f3', chip: 'rgba(255,255,255,.12)', btn: 'rgba(255,255,255,.07)', btnLine: 'rgba(255,255,255,.2)' },
  },
};

/**
 * The theme object screens read through `useTheme()`. The first group is the design's own names. The
 * "aliases" keep the names B's and C's hour-0 placeholders already use, so nothing of theirs breaks.
 */
function withAliases(c: (typeof BASE)[ThemeMode]) {
  return {
    ...c,
    // aliases (older names): same colours, mapped onto the design's tokens
    background: c.bg,
    text: c.text,
    textMuted: c.muted,
    umbrella: c.gold, // "this is yours": earned umbrella time
    border: c.divider,
  };
}

export const palette = { light: withAliases(BASE.light), dark: withAliases(BASE.dark) };
export type Theme = ReturnType<typeof withAliases>;

// ---- typography ------------------------------------------------------------------------------
// Display: Cormorant Garamond (the big weather word, numerals, screen titles). UI: Roboto.
// Font files come from the @expo-google-fonts packages and are loaded by FontGate (ui/FontGate.tsx).
export const fonts = {
  display: 'CormorantGaramond_500Medium',
  displaySemi: 'CormorantGaramond_600SemiBold',
  displayRegular: 'CormorantGaramond_400Regular',
  body: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
export const radius = { s: 8, m: 14, l: 22, xl: 28, pill: 999 } as const;
/** Sizes from the design. `body` is the 16 minimum; `hero` is the big umbrella-time number. */
export const type = { body: 16, small: 14, title: 22, hero: 48, display: 40, weather: 68 } as const;
export const touch = { min: 44 } as const;
export const motion = { fast: 150, normal: 300, slow: 600 } as const;

/** One pastel per app tile in onboarding, picked from the app's name so it stays the same every time. */
export const TILE_COLORS = ['#ffe3bf', '#dbe9ff', '#dcf3e6', '#ece6ff', '#fff0bf', '#ffe1ea'] as const;
export const tileColor = (name: string) => TILE_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TILE_COLORS.length];
