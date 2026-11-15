// OWNER: B (task B8). Quest sheet 3.5 — pass: time drops into the umbrella. Coins fall into the
// umbrella card with one gentle haptic; no motion when reduce-motion is on.
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Button, useTheme } from '../../../ui/components';
import { space, type as font } from '../../../ui/theme';
import { useReduceMotion } from '../../hooks';
import type { PassView } from '../../quest-sheet';
import { Bar, Card } from './SheetParts';

const COINS = 3;
const DROP_MS = 520;
const STAGGER_MS = 110;

/** DESIGN: swap to src/ui/motion.ts when it ships. */
function CoinDrop() {
  const t = useTheme();
  const reduce = useReduceMotion();
  const drops = useRef([...Array(COINS)].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.stagger(STAGGER_MS, drops.map((v) => Animated.timing(v, { toValue: 1, duration: DROP_MS, useNativeDriver: true })));
    anim.start();
    return () => anim.stop();
  }, [reduce, drops]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
      {drops.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: t.umbrella,
            opacity: v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-24, 64] }) }],
          }}
        />
      ))}
    </View>
  );
}

export function QuestPassed({ view, onDone }: { view: PassView; onDone: () => void }) {
  const t = useTheme();
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);
  return (
    <View style={{ gap: space.m }}>
      {/* DESIGN: <Mascot mood="celebrate" /> (it hops) when src/ui ships it */}
      {/* DESIGN: headline in fonts.display (Cormorant 500, ~40) */}
      <Text style={{ color: t.text, fontSize: 36, textAlign: 'center' }}>{view.headline}</Text>
      <Text style={{ color: t.textMuted, fontSize: font.body, textAlign: 'center' }}>{view.sub}</Text>
      <View>
        <CoinDrop />
        <Card>
          {/* DESIGN: umbrella icon before the label */}
          <Text style={{ color: t.textMuted, fontSize: font.body }}>Umbrella time</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
            <Text style={{ color: t.umbrella, fontSize: font.hero, fontWeight: '600' }}>{view.balance}</Text>
            <Text style={{ color: t.textMuted, fontSize: font.body + 2 }}>minutes</Text>
          </View>
          <Bar fraction={view.fraction} />
        </Card>
      </View>
      <Button primary title="Done" onPress={onDone} />
    </View>
  );
}
