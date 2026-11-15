// OWNER: A after hour 0 (src/ui). Shared building blocks every owner may use. B and C only import;
// A maintains them (task A12). They follow the approved design: docs/DESIGN.md.
import React, { createContext, useContext } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Posture } from '../contracts';
import { Icon } from './Icon';
import { SKY, fonts, palette, radius, space, touch, type as font, type ThemeMode } from './theme';
import { weatherFor, weatherIcon } from './weather';

/**
 * Forces light or dark for everything inside it. The app itself follows the phone's setting; the
 * gallery uses this to show both themes side by side.
 */
const ThemeModeContext = createContext<ThemeMode | null>(null);
export const ThemeModeProvider = ThemeModeContext.Provider;

export function useThemeMode(): ThemeMode {
  const forced = useContext(ThemeModeContext);
  const system = useColorScheme();
  return forced ?? (system === 'dark' ? 'dark' : 'light');
}

export function useTheme() {
  return palette[useThemeMode()];
}

/** The colours for text and chips sitting ON a weather sky (not on a plain card). */
export function useSky(posture: Posture) {
  return SKY[useThemeMode()][posture];
}

/**
 * A weather chip: icon + word ("Cloudy"). Words always carry the meaning, colour only reinforces it,
 * so every state is legible without colour.
 *  - variant "sky":   translucent, for sitting on a weather sky (Storm screen, Today)
 *  - variant "solid": filled, for use on a plain card (onboarding's weather lines)
 */
export function WeatherChip({ posture, variant = 'sky' }: { posture: Posture; variant?: 'sky' | 'solid' }) {
  const mode = useThemeMode();
  const sky = SKY[mode][posture];
  const w = weatherFor(posture);
  const solid = { open: ['#fff0bf', '#3a270d'], metered: ['#e4e1f0', '#20203a'], sealed: ['#3f2f86', '#ffffff'] }[posture];
  const bg = variant === 'sky' ? sky.chip : solid[0];
  const fg = variant === 'sky' ? sky.on : solid[1];
  return (
    <View accessibilityLabel={w.name} style={[styles.chip, { backgroundColor: bg }]}>
      <Icon name={weatherIcon(posture, mode === 'dark')} size={18} color={fg} />
      <Text style={{ color: fg, fontSize: 15, fontFamily: fonts.medium }}>{w.word}</Text>
    </View>
  );
}

/** The one-sentence reason, in the design's voice and size. Pass `color` when it sits on a sky. */
export function ReasonLine({ text, color }: { text: string; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color ?? t.text, fontSize: 21, lineHeight: 27, fontFamily: fonts.medium }}>{text}</Text>;
}

/** Umbrella time: the big serif number and "min". Gold, because gold always means "this is yours". */
export function BalanceNumeral({ minutes, label = 'minutes', size = font.hero }: { minutes: number; label?: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text style={{ color: t.gold, fontSize: size, lineHeight: size * 1.05, fontFamily: fonts.displaySemi }}>{minutes}</Text>
      <Text style={{ color: t.muted, fontSize: 15, fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}

/** The design's button: peach with a gold edge when primary, a plain card otherwise. 52 high, 44+ to tap. */
export function Button({ title, onPress, primary }: { title: string; onPress: () => void; primary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.button,
        primary
          ? { backgroundColor: t.primaryBg, borderColor: t.gold }
          : { backgroundColor: t.card, borderColor: t.divider },
      ]}
    >
      <Text style={{ color: primary ? t.primaryText : t.text, fontSize: font.body, fontFamily: fonts.medium }}>{title}</Text>
    </Pressable>
  );
}

/**
 * Hour-0 placeholder for screens still to be built: shows which screen this is, who owns it and which
 * tasks build it, so the whole app shell is navigable on day one. Owners replace it with the real screen
 * (see docs/DESIGN.md for what it should look like).
 */
export function Placeholder({
  title,
  owner,
  tasks,
  children,
}: {
  title: string;
  owner: 'A' | 'B' | 'C';
  tasks: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen}>
      <Text style={{ color: t.text, fontSize: font.display, lineHeight: 42, fontFamily: fonts.display }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>
        Owner: Person {owner} · Tasks {tasks} · docs/specs/{owner === 'A' ? 'A-device' : owner === 'B' ? 'B-day-quests' : 'C-engine-cloud'}.md
      </Text>
      <View style={{ gap: space.m }}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.m, gap: space.m, paddingTop: space.xl },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingLeft: 12, paddingRight: 14, borderRadius: radius.pill },
  button: { minHeight: 52, paddingHorizontal: space.m, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

// Kept so older imports keep working.
export { touch };
