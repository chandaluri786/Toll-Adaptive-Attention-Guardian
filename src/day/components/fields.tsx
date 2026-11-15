// OWNER: B. Small form pieces for B's planner screens. 16 pt text, 44 pt targets, no red:
// problems are shown as a calm note, never as an error colour.
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { fonts, radius, space, touch, type as font } from '../../ui/theme';

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.medium }}>{children}</Text>;
}

export function Note({ children }: { children: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={{ color: t.muted, fontSize: font.small }} accessibilityLiveRegion="polite">{children}</Text>;
}

export function Field(props: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; width?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs, width: props.width }}>
      <Text style={{ color: t.muted, fontSize: font.small }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={t.muted}
        style={[styles.input, { color: t.text, borderColor: t.divider, backgroundColor: t.card }]}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? t.gold : t.divider, backgroundColor: selected ? t.primaryBg : t.card }]}
    >
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: font.body, fontFamily: selected ? fonts.medium : fonts.body }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: touch.min, borderWidth: 1, borderRadius: radius.s, paddingHorizontal: space.s, fontSize: font.body, fontFamily: fonts.body },
  chip: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: space.s, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
