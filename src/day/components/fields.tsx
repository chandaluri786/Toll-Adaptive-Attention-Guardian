// OWNER: B. Small form pieces for B's planner screens. 16 pt text, 44 pt targets, no red:
// problems are shown as a calm note, never as an error colour.
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { radius, space, touch, type as font } from '../../ui/theme';

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: font.body, fontWeight: '700' }}>{children}</Text>;
}

export function Note({ children }: { children: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={{ color: t.textMuted, fontSize: font.small }} accessibilityLiveRegion="polite">{children}</Text>;
}

export function Field(props: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; width?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs, width: props.width }}>
      <Text style={{ color: t.textMuted, fontSize: font.small }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={t.textMuted}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
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
      style={[styles.chip, { borderColor: selected ? t.umbrella : t.border, backgroundColor: selected ? t.umbrella : t.surface }]}
    >
      <Text style={{ color: selected ? '#FFFFFF' : t.text, fontSize: font.body }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: touch.min, borderWidth: 1, borderRadius: radius.s, paddingHorizontal: space.s, fontSize: font.body },
  chip: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: space.s, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
