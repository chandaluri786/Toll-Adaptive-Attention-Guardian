// OWNER: B (task B8). The live readout ring (3.2–3.4): a gold arc over a faint track, the big
// number in the middle in the display serif.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../../ui/components';
import { fonts, type as font } from '../../../ui/theme';

const SIZE = 200;
const STROKE = 14;

export function ProgressRing({ fraction, big, sub }: { fraction: number; big: string; sub: string }) {
  const t = useTheme();
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <View style={{ width: SIZE, height: SIZE, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${big} ${sub}`}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke={t.track} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={t.gold}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - f)}
          strokeLinecap="butt"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <Text style={{ color: t.text, fontSize: font.hero, lineHeight: font.hero * 1.05, fontFamily: fonts.displaySemi }}>{big}</Text>
      <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{sub}</Text>
    </View>
  );
}
