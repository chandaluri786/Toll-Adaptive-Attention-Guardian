// OWNER: C (tasks C6, C7). Small layout pieces for C's Settings and demo panel, built only from
// src/ui on main (useTheme + tokens). A's Card/Icon primitives aren't on main yet; swap them in
// when they land. Colours come from the theme; body 16 pt, targets 44 pt, no red.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { radius, space, touch, type as font } from '../../ui/theme';

const CARD_RADIUS = 22;
const STEPPER_SIZE = touch.min;

export function ScreenTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: 40, fontWeight: '500' }} accessibilityRole="header">{children}</Text>;
}

export function Card({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Muted({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.textMuted, fontSize: font.small }}>{children}</Text>;
}

export function Body({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: font.body }}>{children}</Text>;
}

/** A title + subtitle row with a value or control on the right (design 7.1 / 7.3 rows). */
export function Row({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {typeof right === 'string' ? <Text style={{ color: t.textMuted, fontSize: font.body }}>{right}</Text> : right}
    </View>
  );
}

/** A row that opens its section in place, with a chevron (Settings rows in 7.1). */
export function DisclosureRow(props: { title: string; subtitle?: string; open: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: props.open }}
      onPress={props.onToggle}
      style={styles.row}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{props.title}</Text>
        {props.subtitle ? <Muted>{props.subtitle}</Muted> : null}
      </View>
      <Text style={{ color: t.textMuted, fontSize: font.title }}>{props.open ? '⌄' : '›'}</Text>
    </Pressable>
  );
}

function RoundButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={[styles.round, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <Text style={{ color: t.text, fontSize: font.title }}>{label}</Text>
    </Pressable>
  );
}

/** − value + (design 7.3). */
export function Stepper(props: { value: string; label: string; onMinus: () => void; onPlus: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.stepper}>
      <RoundButton label="−" a11y={`Lower ${props.label}`} onPress={props.onMinus} />
      <Text style={{ color: t.text, fontSize: font.body, minWidth: 48, textAlign: 'center' }} accessibilityLiveRegion="polite">
        {props.value}
      </Text>
      <RoundButton label="+" a11y={`Raise ${props.label}`} onPress={props.onPlus} />
    </View>
  );
}

/** A compact choice for the demo panel (speed, weather), selected in the umbrella accent. */
export function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? t.umbrella : t.border, backgroundColor: selected ? t.umbrella : t.surface }]}
    >
      <Text style={{ color: selected ? t.surface : t.text, fontSize: font.body, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.choices}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: CARD_RADIUS, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.m, paddingVertical: space.s },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.s },
  round: {
    width: STEPPER_SIZE,
    height: STEPPER_SIZE,
    borderRadius: STEPPER_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  choice: {
    minHeight: touch.min,
    minWidth: touch.min,
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
});
