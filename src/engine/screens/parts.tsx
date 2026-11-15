// OWNER: C (tasks C6, C7). The few layout pieces C's Settings and demo panel need that A's src/ui
// doesn't provide. Card, Display, Body and Segmented come from src/ui/primitives; what stays here:
//  - Divider, Row, DisclosureRow: the hairline-separated rows inside one card (7.1, 7.3). A's
//    ChoiceRow is a standalone bordered tick row (the app pickers), not a row inside a card.
//  - Stepper: the round − value + control of 7.3; src/ui has none.
//  - Choice / Choices: wrapping pill buttons for the demo panel's one-tap actions; Segmented is for
//    picking one of a few, not for a wrap of independent actions.
// Colours only from the theme; body 16, secondary 14, targets 44, no red.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { fonts, radius, space, touch, type as font } from '../../ui/theme';

const ROW_MIN_HEIGHT = 56;
const STEPPER_SIZE = touch.min;
const STEPPER_VALUE_WIDTH = 56;
const ICON_SIZE = 22;

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.divider }} />;
}

function RowText({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>{title}</Text>
      {subtitle ? <Text style={{ color: t.muted, fontSize: font.small, lineHeight: 18, fontFamily: fonts.body }}>{subtitle}</Text> : null}
    </View>
  );
}

/** A title + subtitle row with a value or control on the right (design 7.3 rows). */
export function Row({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <RowText title={title} subtitle={subtitle} />
      {typeof right === 'string' ? <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{right}</Text> : right}
    </View>
  );
}

/** A row that opens its section in place: leading icon, title, subtitle, chevron (Settings rows in 7.1). */
export function DisclosureRow(props: { title: string; subtitle?: string; icon?: IconName; open: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: props.open }}
      onPress={props.onToggle}
      style={[styles.row, { gap: space.m }]}
    >
      {props.icon ? <Icon name={props.icon} size={ICON_SIZE} color={t.muted} /> : null}
      <RowText title={props.title} subtitle={props.subtitle} />
      <View style={{ transform: [{ rotate: props.open ? '90deg' : '0deg' }] }}>
        <Icon name="chevron-right" size={ICON_SIZE} color={t.faint} />
      </View>
    </Pressable>
  );
}

// Text glyphs, not Icon: src/ui/Icon.tsx (A's) has `plus` but no `minus`, and a mixed pair looks off.
function RoundButton({ glyph, a11y, onPress }: { glyph: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={[styles.round, { borderColor: t.divider, backgroundColor: t.card }]}
    >
      <Text style={{ color: t.text, fontSize: font.title, lineHeight: font.title + 2, fontFamily: fonts.body }}>{glyph}</Text>
    </Pressable>
  );
}

/** − value + (design 7.3). */
export function Stepper(props: { value: string; label: string; onMinus: () => void; onPlus: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.stepper}>
      <RoundButton glyph="−" a11y={`Lower ${props.label}`} onPress={props.onMinus} />
      <Text
        style={{ color: t.text, fontSize: font.body, fontFamily: fonts.medium, minWidth: STEPPER_VALUE_WIDTH, textAlign: 'center' }}
        accessibilityLiveRegion="polite"
      >
        {props.value}
      </Text>
      <RoundButton glyph="+" a11y={`Raise ${props.label}`} onPress={props.onPlus} />
    </View>
  );
}

/** A one-tap pill for the demo panel. Selected uses the gold edge and peach fill, like the design's selected chips. */
export function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? t.gold : t.divider, backgroundColor: selected ? t.primaryBg : t.card }]}
    >
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: font.body, fontFamily: fonts.medium }}>{label}</Text>
    </Pressable>
  );
}

/** A wrapping line of Choice pills. */
export function Choices({ children }: { children: React.ReactNode }) {
  return <View style={styles.choices}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: ROW_MIN_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.s },
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
