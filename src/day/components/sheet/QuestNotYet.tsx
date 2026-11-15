// OWNER: B (task B8). Quest sheet 3.6 — not yet: a kind, plain reason, the retry countdown, and
// "Didn't catch it? Claim half". Never "failed", never red.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { Mascot } from '../../../ui/Mascot';
import { Display } from '../../../ui/primitives';
import { fonts, radius, space, touch, type as font } from '../../../ui/theme';
import type { NotYetView } from '../../quest-sheet';
import { TextLink } from './SheetParts';

type Props = { view: NotYetView; onRetry: () => void; onClaimHalf: () => void };

export function QuestNotYet({ view, onRetry, onClaimHalf }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m, alignItems: 'stretch' }}>
      <View style={{ alignItems: 'center', gap: space.s }}>
        <Mascot mood="calm" size={64} />
        <Display>Not quite yet</Display>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s + 2, backgroundColor: t.surface, borderRadius: radius.m + 4, padding: space.m }}>
        <Icon name="info" size={20} color={t.muted} />
        <Text style={{ flex: 1, color: t.text, fontSize: font.body + 2, fontFamily: fonts.body }}>{view.reason}</Text>
      </View>
      {!!view.hint && <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body, textAlign: 'center' }}>{view.hint}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !view.retry.ready }}
        disabled={!view.retry.ready}
        onPress={onRetry}
        style={{ minHeight: touch.min + 8, borderRadius: radius.m, borderWidth: 1, borderStyle: 'dashed', borderColor: t.divider, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: t.text, fontSize: font.body + 1, fontFamily: fonts.medium }}>{view.retry.label}</Text>
      </Pressable>
      {!!view.claimHalf && <TextLink title={view.claimHalf} onPress={onClaimHalf} underline gold />}
    </View>
  );
}
