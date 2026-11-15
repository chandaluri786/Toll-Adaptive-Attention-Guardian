// OWNER: B (task B9). Today's top (2.1–2.5): weather chip, the weather word, reason, next change.
// DESIGN: swap the flat sky colour for <SkyScene posture quiet /> + useSky(posture), add
// <Mascot mood="happy|calm" /> on the right and the sun/cloud/cloud-lightning chip icon via
// src/ui/Icon, and set the word in fonts.display (Cormorant 500, 68/65) when src/ui ships them.
import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Posture } from '../../../contracts';
import { useTheme } from '../../../ui/components';
import { radius, space, type as font } from '../../../ui/theme';
import { weatherFor } from '../../../ui/weather';

type Props = { posture: Posture; chip: string; name: string; reason: string; nextLine: string | null };

export function SkyHeader({ posture, chip, name, reason, nextLine }: Props) {
  const t = useTheme();
  const sky = t[weatherFor(posture).paletteKey];
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: sky.sky, paddingTop: insets.top + space.m, paddingHorizontal: space.l - 4, paddingBottom: space.xl + space.s, gap: space.s }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: t.surface, opacity: 0.85, borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: space.s }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{chip}</Text>
      </View>
      <Text accessibilityRole="header" style={{ color: sky.ink, fontSize: 60, lineHeight: 66, marginTop: space.l }}>
        {name}
      </Text>
      <Text style={{ color: sky.ink, fontSize: 20, fontWeight: '500' }}>{reason}</Text>
      {/* DESIGN: clock icon before the next-change line */}
      {!!nextLine && <Text style={{ color: sky.ink, fontSize: font.body, opacity: 0.85 }}>{nextLine}</Text>}
    </View>
  );
}
