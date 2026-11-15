// OWNER: B (task B9). Today's top (2.1–2.5): weather chip, the weather word, reason, next change.
// DESIGN: swap the flat sky colour for <SkyScene posture quiet /> + useSky(posture), add
// <Mascot mood="happy|calm" /> on the right and the sun/cloud/cloud-lightning chip icon via
// src/ui/Icon, and set the word in fonts.display (Cormorant 500, 68/65) when src/ui ships them.
import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Posture } from '../../../contracts';
import { useSky } from '../../../ui/components';
import { radius, space, type as font } from '../../../ui/theme';

type Props = { posture: Posture; chip: string; name: string; reason: string; nextLine: string | null };

export function SkyHeader({ posture, chip, name, reason, nextLine }: Props) {
  const sky = useSky(posture);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: sky.top, paddingTop: insets.top + space.m, paddingHorizontal: space.l - 4, paddingBottom: space.xl + space.s, gap: space.s }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: sky.chip, borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: space.s }}>
        <Text style={{ color: sky.on, fontSize: font.body }}>{chip}</Text>
      </View>
      <Text accessibilityRole="header" style={{ color: sky.on, fontSize: 60, lineHeight: 66, marginTop: space.l }}>
        {name}
      </Text>
      <Text style={{ color: sky.on, fontSize: 20, fontWeight: '500' }}>{reason}</Text>
      {/* DESIGN: clock icon before the next-change line */}
      {!!nextLine && <Text style={{ color: sky.onMuted, fontSize: font.body }}>{nextLine}</Text>}
    </View>
  );
}
