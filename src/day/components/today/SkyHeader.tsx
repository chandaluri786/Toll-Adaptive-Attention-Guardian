// OWNER: B (task B9). Today's top (2.1–2.5): A's quiet SkyScene behind the weather chip, the weather
// word in the display serif, the mascot on the right, the reason, and the next change with a clock.
// Colours come from useSky(posture), so the text stays legible on every sky in light and dark.
import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Posture } from '../../../contracts';
import { ReasonLine, useSky, WeatherChip } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { Mascot, type MascotMood } from '../../../ui/Mascot';
import { SkyScene } from '../../../ui/SkyScene';
import { fonts, space, type as font } from '../../../ui/theme';

type Props = { posture: Posture; name: string; reason: string; nextLine: string | null };

/** The mascot reacts to the weather (DESIGN.md): happy when clear, calm when cloudy, sleepy in a storm. */
const MOOD: Record<Posture, MascotMood> = { open: 'happy', metered: 'calm', sealed: 'sleepy' };
const MASCOT_SIZE = 64;
/** Room under the text for the content sheet's rounded top, which overlaps the sky. */
const SHEET_OVERLAP = space.xl + space.s;

export function SkyHeader({ posture, name, reason, nextLine }: Props) {
  const sky = useSky(posture);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ overflow: 'hidden', backgroundColor: sky.top }}>
      <SkyScene posture={posture} quiet />
      <View style={{ paddingTop: insets.top + space.m, paddingHorizontal: space.l - 4, paddingBottom: SHEET_OVERLAP, gap: space.s }}>
        <WeatherChip posture={posture} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: space.xl + space.l }}>
          <Text
            accessibilityRole="header"
            style={{ flex: 1, color: sky.on, fontSize: font.weather, lineHeight: font.weather - 3, fontFamily: fonts.display, letterSpacing: -0.6 }}
          >
            {name}
          </Text>
          <Mascot mood={MOOD[posture]} size={MASCOT_SIZE} />
        </View>
        <ReasonLine text={reason} color={sky.on} />
        {!!nextLine && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s - 2 }}>
            <Icon name="clock" size={16} color={sky.onMuted} />
            <Text style={{ color: sky.onMuted, fontSize: font.body, fontFamily: fonts.body }}>{nextLine}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
