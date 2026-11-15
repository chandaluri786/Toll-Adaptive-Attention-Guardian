// OWNER: B (task B8). Small building blocks for B's quest sheet and Today cards. Colours only via
// useTheme(). DESIGN: swap to Card / Body / Display from src/ui/primitives and `fonts` from
// src/ui/theme when src/ui ships them; the gold/peach/good/free tokens map to `umbrella` until then.
import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../../ui/components';
import { radius, space, touch, type as font } from '../../../ui/theme';

export function Card({ children, dashed, style }: { children: React.ReactNode; dashed?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderRadius: radius.l, padding: space.m + 2, gap: space.s + 2 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A thin progress bar. `tone` picks the fill: umbrella time (gold) or free time (blue). */
export function Bar({ fraction, tone = 'umbrella' }: { fraction: number; tone?: 'umbrella' | 'free' }) {
  const t = useTheme();
  // DESIGN: `free` token (blue) for the free-time meter; clear.sky stands in until it ships.
  const fill = tone === 'umbrella' ? t.umbrella : t.clear.sky;
  const pct = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as const;
  return (
    <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: t.border, overflow: 'hidden' }}>
      <View style={{ width: pct, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
    </View>
  );
}

/** "In progress" status pill (3.2–3.4). DESIGN: `good` token tint. */
export function StatusPill({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, backgroundColor: t.background, borderRadius: radius.pill, paddingHorizontal: space.s + 4, paddingVertical: space.xs + 2 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.umbrella }} />
      <Text style={{ color: t.text, fontSize: font.small }}>{label}</Text>
    </View>
  );
}

/** A quiet text button ("Stop quest", "Didn't catch it? Claim half — 12 min"). */
export function TextLink({ title, onPress, underline, gold }: { title: string; onPress: () => void; underline?: boolean; gold?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: gold ? t.umbrella : t.textMuted, fontSize: font.body, textDecorationLine: underline ? 'underline' : 'none' }}>{title}</Text>
    </Pressable>
  );
}

/** Pill chip for "Other quests" (3.1): label plus a gold "+25". */
export function QuestChip({ label, pays, disabled, onPress }: { label: string; pays: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingHorizontal: space.m - 2, borderRadius: radius.m, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, opacity: disabled ? 0.55 : 1 }}
    >
      {/* DESIGN: type icon via src/ui/Icon when it ships */}
      <Text style={{ color: t.text, fontSize: font.body }}>{label}</Text>
      <Text style={{ color: t.umbrella, fontSize: font.body, fontWeight: '600' }}>{pays}</Text>
    </Pressable>
  );
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}
