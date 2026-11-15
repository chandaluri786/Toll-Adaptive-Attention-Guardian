// OWNER: B (task B8). Quest sheet 3.5 — pass: time drops into the umbrella. Coins fall into the
// umbrella card with one gentle haptic; no motion when reduce-motion is on.
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { BalanceNumeral, Button, useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { Mascot } from '../../../ui/Mascot';
import { useReducedMotion, USE_NATIVE_DRIVER } from '../../../ui/motion';
import { Display } from '../../../ui/primitives';
import { fonts, space, type as font } from '../../../ui/theme';
import type { PassView } from '../../quest-sheet';
import { Bar, Card } from './SheetParts';

const COINS = 3;
const DROP_MS = 520;
const STAGGER_MS = 110;

/** Three coins fall into the umbrella card. Off under reduce-motion (src/ui/motion). */
function CoinDrop() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const drops = useRef([...Array(COINS)].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.stagger(STAGGER_MS, drops.map((v) => Animated.timing(v, { toValue: 1, duration: DROP_MS, useNativeDriver: USE_NATIVE_DRIVER })));
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
            backgroundColor: t.gold,
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
      <View style={{ alignItems: 'center', gap: space.s }}>
        <Mascot mood="celebrate" size={72} />
        <Display>{view.headline}</Display>
      </View>
      <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body, textAlign: 'center' }}>{view.sub}</Text>
      <View>
        <CoinDrop />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Icon name="umbrella" size={18} color={t.gold} />
            <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>Umbrella time</Text>
          </View>
          <BalanceNumeral minutes={view.balance} />
          <Bar fraction={view.fraction} />
        </Card>
      </View>
      <Button primary title="Done" onPress={onDone} />
    </View>
  );
}
