// OWNER: B (task B8). Quest sheet 3.6 — not yet: a kind, plain reason, the retry countdown, and
// "Didn't catch it? Claim half". Never "failed", never red.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../../ui/components';
import { radius, space, touch, type as font } from '../../../ui/theme';
import type { NotYetView } from '../../quest-sheet';
import { TextLink } from './SheetParts';

type Props = { view: NotYetView; onRetry: () => void; onClaimHalf: () => void };

export function QuestNotYet({ view, onRetry, onClaimHalf }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m, alignItems: 'stretch' }}>
      {/* DESIGN: <Mascot mood="calm" /> above the title when src/ui ships it */}
      {/* DESIGN: title in fonts.display (Cormorant 500, ~40) */}
      <Text style={{ color: t.text, fontSize: 36, textAlign: 'center' }}>Not quite yet</Text>
      <View style={{ backgroundColor: t.background, borderRadius: radius.m + 4, padding: space.m }}>
        {/* DESIGN: map-pin / type icon before the reason */}
        <Text style={{ color: t.text, fontSize: font.body + 2 }}>{view.reason}</Text>
      </View>
      {!!view.hint && <Text style={{ color: t.textMuted, fontSize: font.body, textAlign: 'center' }}>{view.hint}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !view.retry.ready }}
        disabled={!view.retry.ready}
        onPress={onRetry}
        style={{ minHeight: touch.min + 8, borderRadius: radius.m, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: t.text, fontSize: font.body + 1 }}>{view.retry.label}</Text>
      </Pressable>
      {!!view.claimHalf && <TextLink title={view.claimHalf} onPress={onClaimHalf} underline gold />}
    </View>
  );
}
