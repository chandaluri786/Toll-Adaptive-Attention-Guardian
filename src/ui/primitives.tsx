// OWNER: A (src/ui). Small layout building blocks shared by A's screens (and free for B and C to use),
// styled from the approved design (docs/DESIGN.md). Rules: body text never below 16 (14 for secondary),
// touch targets at least 44, no red, every state legible without colour (words and icons carry meaning).
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from './components';
import { Icon, type IconName } from './Icon';
import { fonts, radius, space, touch, type as font } from './theme';

/** A plain card: the design's white (or dark navy) rounded panel with a hairline border. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.divider }, style]}>{children}</View>;
}

/** Big serif screen title ("Forecast", "Where's home?"). Pass `size` for the smaller section titles. */
export function Display({ children, size = font.display, color }: { children: React.ReactNode; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={{ color: color ?? t.text, fontSize: size, lineHeight: size * 1.05, fontFamily: fonts.display, letterSpacing: -0.4 }}>
      {children}
    </Text>
  );
}

/** Section title inside a screen (Roboto medium, 22). */
export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={{ color: t.text, fontSize: font.title, lineHeight: 28, fontFamily: fonts.medium }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, small, color }: { children: React.ReactNode; muted?: boolean; small?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Text style={{ color: color ?? (muted ? t.muted : t.text), fontSize: small ? font.small : font.body, lineHeight: small ? 20 : 24, fontFamily: fonts.body }}>
      {children}
    </Text>
  );
}

/** A small caption above a card's content ("Goals", "This week", "Umbrella time"). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>{children}</Text>;
}

/** A tappable row with a round tick on the left: used for the app pickers in Settings. */
export function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
  accessory,
  disabled,
}: {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  accessory?: React.ReactNode;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, { borderColor: selected ? t.gold : t.divider, backgroundColor: t.card, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.dot, { backgroundColor: selected ? t.good : 'transparent', borderColor: selected ? t.good : t.faint }]}>
        {selected && <Icon name="check" size={14} color="#ffffff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.medium }}>{title}</Text>
        {!!subtitle && <Text style={{ color: t.muted, fontSize: font.small, marginTop: 2, fontFamily: fonts.body }}>{subtitle}</Text>}
      </View>
      {accessory}
    </Pressable>
  );
}

/** A segmented switcher, e.g. Week / Month / 6 months. The selected segment is a raised card. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surface, borderColor: t.divider }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[styles.segment, on && { backgroundColor: t.card, borderColor: t.divider, borderWidth: 1, boxShadow: '0 1px 3px rgba(20,22,40,.12)' }]}
          >
            <Text style={{ color: on ? t.text : t.muted, fontSize: font.body, fontFamily: on ? fonts.medium : fonts.body }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A horizontal bar, `value` out of `max`. Gold by default; the free-time meter passes the blue. */
export function Meter({ value, max, color, label }: { value: number; max: number; color?: string; label?: string }) {
  const t = useTheme();
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={[styles.meterTrack, { backgroundColor: t.track }]}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? t.gold, borderRadius: radius.pill }} />
    </View>
  );
}

/** Tiny vertical bars for a per-day series. */
export function MiniBars({ values, max, color, height = 56 }: { values: number[]; max: number; color: string; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: values.length > 40 ? 1 : 4, height }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{ flex: 1, height: Math.max(2, (max <= 0 ? 0 : v / max) * height), backgroundColor: color, borderRadius: 3, opacity: v === 0 ? 0.3 : 1 }}
        />
      ))}
    </View>
  );
}

/**
 * A full-width choice button. `primary` is the design's peach; otherwise an outlined neutral button. A
 * disabled button still shows its `hint`, so the reason is never a mystery.
 */
export function ChoiceButton({
  title,
  hint,
  onPress,
  primary,
  disabled,
}: {
  title: string;
  hint?: string | null;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityHint={hint ?? undefined}
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.choice,
          primary ? { backgroundColor: t.primaryBg, borderColor: t.gold } : { backgroundColor: t.card, borderColor: t.divider },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={{ color: primary ? t.primaryText : t.text, fontSize: font.body, fontFamily: fonts.medium }}>{title}</Text>
      </Pressable>
      {!!hint && <Text style={{ color: t.muted, fontSize: font.small, textAlign: 'center', fontFamily: fonts.body }}>{hint}</Text>}
    </View>
  );
}

/** A round icon on a tinted disc: used inside "doors" and notification cards. */
export function IconDisc({ name, size = 40, bg, color }: { name: IconName; size?: number; bg: string; color: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.52)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.l, padding: space.m, gap: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch.min + 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: space.m, paddingVertical: space.s },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, padding: 4 },
  segment: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: space.s },
  meterTrack: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  choice: { minHeight: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.m },
});
