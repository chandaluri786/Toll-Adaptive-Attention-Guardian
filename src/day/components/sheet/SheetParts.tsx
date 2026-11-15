// OWNER: B (task B8). Small building blocks for B's quest sheet and Today cards, on A's src/ui:
// colours through useTheme(), fonts from `fonts`, icons from Icon. Card wraps A's primitive Card and
// only adds the dashed border of the "No plan today" card (2.5).
import React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../../ui/components';
import { Icon, type IconName } from '../../../ui/Icon';
import { Card as UiCard } from '../../../ui/primitives';
import { fonts, radius, space, touch, type as font } from '../../../ui/theme';

const BAR_HEIGHT = 10;
const DOT = 8;

export function Card({ children, dashed, style }: { children: React.ReactNode; dashed?: boolean; style?: ViewStyle }) {
  return <UiCard style={{ padding: space.m + 2, gap: space.s + 2, ...(dashed ? { borderStyle: 'dashed' } : null), ...style }}>{children}</UiCard>;
}

/** A thin progress bar. `tone` picks the fill: umbrella time (gold) or free time (blue). */
export function Bar({ fraction, tone = 'umbrella' }: { fraction: number; tone?: 'umbrella' | 'free' }) {
  const t = useTheme();
  const fill = tone === 'umbrella' ? t.gold : t.free;
  const pct = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as const;
  return (
    <View style={{ height: BAR_HEIGHT, borderRadius: radius.pill, backgroundColor: t.track, overflow: 'hidden' }}>
      <View style={{ width: pct, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
    </View>
  );
}

/** "In progress" status pill (3.2–3.4) on the `good` tint. */
export function StatusPill({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, backgroundColor: t.goodTint, borderRadius: radius.pill, paddingHorizontal: space.s + 4, paddingVertical: space.xs + 2 }}>
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: t.good }} />
      <Text style={{ color: t.text, fontSize: font.small, fontFamily: fonts.medium }}>{label}</Text>
    </View>
  );
}

/** A quiet text button ("Stop quest", "Didn't catch it? Claim half — 12 min"). */
export function TextLink({ title, onPress, underline, gold }: { title: string; onPress: () => void; underline?: boolean; gold?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: gold ? t.goldText : t.muted, fontSize: font.body, fontFamily: gold ? fonts.medium : fonts.body, textDecorationLine: underline ? 'underline' : 'none' }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Pill chip for "Other quests" (3.1): type icon, label, and a gold "+25". */
export function QuestChip({ label, pays, icon, disabled, onPress }: { label: string; pays: string; icon: IconName; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingHorizontal: space.m - 2, borderRadius: radius.m, borderWidth: 1, borderColor: t.divider, backgroundColor: t.card, opacity: disabled ? 0.55 : 1 }}
    >
      <Icon name={icon} size={18} color={t.text} />
      <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>{label}</Text>
      <Text style={{ color: t.goldText, fontSize: font.body, fontFamily: fonts.medium }}>{pays}</Text>
    </Pressable>
  );
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.divider }} />;
}
