// OWNER: A after hour 0 (src/ui). Shared building blocks every owner may use. A polishes them (A12);
// B and C only import them.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Posture } from '../contracts';
import { palette, radius, space, touch, type as font } from './theme';
import { weatherFor } from './weather';

export function useTheme() {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function WeatherChip({ posture }: { posture: Posture }) {
  const t = useTheme();
  const w = weatherFor(posture);
  const c = t[w.paletteKey];
  return (
    <View style={[styles.chip, { backgroundColor: c.sky }]} accessibilityLabel={w.name}>
      <Text style={{ color: c.ink, fontSize: font.small, fontWeight: '600' }}>
        {w.icon} {w.word}
      </Text>
    </View>
  );
}

export function ReasonLine({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: font.body }}>{text}</Text>;
}

export function BalanceNumeral({ minutes, label = 'minutes of umbrella time' }: { minutes: number; label?: string }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.umbrella, fontSize: font.hero, fontWeight: '700' }}>{minutes}</Text>
      <Text style={{ color: t.textMuted, fontSize: font.small }}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, primary }: { title: string; onPress: () => void; primary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: primary ? t.umbrella : t.surface, borderColor: t.border },
      ]}
    >
      <Text style={{ color: primary ? '#FFFFFF' : t.text, fontSize: font.body, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/**
 * Hour-0 placeholder: shows which screen this is, who owns it and which tasks build it, so the
 * whole app shell is navigable on day one. Owners replace it with the real screen.
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
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={{ color: t.text, fontSize: font.title, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: t.textMuted, fontSize: font.small }}>
        Owner: Person {owner} · Tasks {tasks} · docs/specs/{owner === 'A' ? 'A-device' : owner === 'B' ? 'B-day-quests' : 'C-engine-cloud'}.md
      </Text>
      <View style={{ gap: space.m }}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.m, gap: space.m, paddingTop: space.xl },
  chip: { alignSelf: 'flex-start', paddingHorizontal: space.m, paddingVertical: space.xs, borderRadius: radius.pill },
  button: {
    minHeight: touch.min,
    paddingHorizontal: space.m,
    borderRadius: radius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
