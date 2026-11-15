// OWNER: A (src/ui, task A12). The mascot: a small cloud (or a tiny sun) with a face. A port of the
// approved design's "figure" component, geometry for geometry.
//
// Rules (planning doc, Visual language): it reacts to the weather and celebrates earned time. It NEVER
// scolds, begs or guilt-trips, and it stays OUT OF THE WAY on the Storm screen (there it does not appear).
// Where it appears in the design:
//   happy      Clear skies: on Today, and in onboarding step 1
//   calm       Cloudy
//   celebrate  earned time: a passed quest (it hops)
//   sleepy     night, or nothing to show yet: the empty Forecast ("z")
//   peek       a quick hello, e.g. beside a section title
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useThemeMode } from './components';
import { USE_NATIVE_DRIVER, useReducedMotion } from './motion';
import { fonts } from './theme';

export type MascotMood = 'happy' | 'calm' | 'celebrate' | 'sleepy' | 'peek';
export type MascotVariant = 'cloud' | 'sun';

const INK = '#22253a';

export type MascotProps = {
  variant?: MascotVariant;
  mood?: MascotMood;
  size?: number;
  /** Force dark/light. Defaults to the current theme. */
  dark?: boolean;
};

export function Mascot({ variant = 'cloud', mood = 'happy', size: S = 72, dark }: MascotProps) {
  const themeDark = useThemeMode() === 'dark';
  const isDark = dark ?? themeDark;
  const reduced = useReducedMotion();
  const gid = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  // ---- motion: a slow bob, or a hop when celebrating; sun rays turn slowly ----
  const bob = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      bob.setValue(0);
      return;
    }
    const to = (v: number, ms: number, easing = Easing.inOut(Easing.sin)) =>
      Animated.timing(bob, { toValue: v, duration: ms, easing, useNativeDriver: USE_NATIVE_DRIVER });
    const loop = Animated.loop(
      mood === 'celebrate'
        ? Animated.sequence([to(-14, 330), to(0, 275), to(-4, 165), to(0, 330)]) // the design's hop, 1.1 s
        : Animated.sequence([to(-4, 1800), to(0, 1800)]), // the design's bob, 3.6 s
    );
    loop.start();
    return () => loop.stop();
  }, [mood, reduced, bob]);
  useEffect(() => {
    if (reduced || variant !== 'sun') return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 40000, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [reduced, variant, spin]);

  // ---- the face (shared by both variants) ----
  const eyeW = S * 0.075;
  const stroke = Math.max(2, S * 0.03);
  const round = { borderRadius: 99 } as const;
  const openEyes = mood === 'happy' || mood === 'peek';
  const eye = (left: number) => {
    if (openEyes) return <View style={[round, { position: 'absolute', left, top: 0, width: eyeW, height: eyeW * 1.25, backgroundColor: INK }]} />;
    if (mood === 'celebrate') {
      // a happy arch: ^
      return <View style={{ position: 'absolute', left, top: 0, width: eyeW * 1.7, height: eyeW * 1.1, borderTopWidth: stroke, borderColor: INK, borderTopLeftRadius: 99, borderTopRightRadius: 99 }} />;
    }
    // a closed, content eye: u
    return <View style={{ position: 'absolute', left, top: eyeW * 0.4, width: eyeW * 1.7, height: eyeW * 0.9, borderBottomWidth: stroke, borderColor: INK, borderBottomLeftRadius: 99, borderBottomRightRadius: 99 }} />;
  };
  const mouth =
    mood === 'celebrate' ? (
      <View style={{ position: 'absolute', left: '50%', top: eyeW * 2, width: S * 0.13, height: S * 0.075, marginLeft: -S * 0.065, backgroundColor: INK, borderBottomLeftRadius: 99, borderBottomRightRadius: 99 }} />
    ) : mood === 'sleepy' ? (
      <View style={[round, { position: 'absolute', left: '50%', top: eyeW * 2.1, width: S * 0.05, height: S * 0.05, marginLeft: -S * 0.025, borderWidth: Math.max(1.5, S * 0.022), borderColor: INK }]} />
    ) : (
      <View style={{ position: 'absolute', left: '50%', top: eyeW * 1.7, width: S * 0.14, height: S * 0.07, marginLeft: -S * 0.07, borderBottomWidth: stroke, borderColor: INK, borderBottomLeftRadius: 99, borderBottomRightRadius: 99 }} />
    );
  const cheek = (left: number) => (
    <View style={[round, { position: 'absolute', left, top: eyeW * 1.5, width: S * 0.09, height: S * 0.05, backgroundColor: '#ffbf9e', opacity: 0.75 }]} />
  );
  const faceW = S * 0.42;
  const face = (top: number) => (
    <View style={{ position: 'absolute', left: '50%', top, width: faceW, height: S * 0.2, marginLeft: -faceW / 2 }}>
      {eye(faceW * 0.18)}
      {eye(faceW * 0.82 - eyeW * (openEyes ? 1 : 1.7))}
      {mouth}
      {cheek(-S * 0.02)}
      {cheek(faceW - S * 0.07)}
    </View>
  );

  // ---- the body ----
  let body: React.ReactNode;
  if (variant === 'sun') {
    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    body = (
      <View style={{ width: S, height: S }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * 45}deg` }] }]}>
              <View style={[round, { position: 'absolute', left: S / 2 - S * 0.05, top: 0, width: S * 0.1, height: S * 0.2, backgroundColor: '#ffb52e' }]} />
            </View>
          ))}
        </Animated.View>
        <View style={{ position: 'absolute', left: S * 0.17, top: S * 0.17, width: S * 0.66, height: S * 0.66 }}>
          <Svg width={S * 0.66} height={S * 0.66}>
            <Defs>
              <RadialGradient id={`d${gid}`} cx="38%" cy="34%" r="70%">
                <Stop offset="0" stopColor="#fff3c4" />
                <Stop offset="0.55" stopColor="#ffd45e" />
                <Stop offset="1" stopColor="#ffc23d" />
              </RadialGradient>
            </Defs>
            <Circle cx={S * 0.33} cy={S * 0.33} r={S * 0.33} fill={`url(#d${gid})`} />
          </Svg>
        </View>
        {face(S * 0.42)}
      </View>
    );
  } else {
    const col = isDark ? '#eceaf8' : '#ffffff';
    const W = S;
    const H = S * 0.72;
    const shadow = isDark ? undefined : '0 4px 8px rgba(40,40,80,.14)';
    const puff = { backgroundColor: col, borderRadius: 99, position: 'absolute', boxShadow: shadow } as const;
    body = (
      <View style={{ width: W, height: H }}>
        <View style={[puff, { left: 0, right: 0, bottom: 0, height: H * 0.56 }]} />
        <View style={[puff, { left: W * 0.14, bottom: H * 0.22, width: W * 0.44, height: W * 0.44 }]} />
        <View style={[puff, { left: W * 0.46, bottom: H * 0.2, width: W * 0.36, height: W * 0.36 }]} />
        {face(H * 0.48)}
      </View>
    );
  }

  const label = `Toll's ${variant === 'sun' ? 'sun' : 'cloud'}, feeling ${mood === 'celebrate' ? 'happy' : mood}`;
  return (
    <Animated.View accessible accessibilityRole="image" accessibilityLabel={label} style={{ transform: [{ translateY: bob }] }}>
      {body}
      {mood === 'sleepy' && (
        <Text style={{ position: 'absolute', right: -S * 0.12, top: -S * 0.12, fontFamily: fonts.medium, fontSize: Math.round(S * 0.2), color: isDark ? '#c6cde9' : '#565b6c' }}>z</Text>
      )}
    </Animated.View>
  );
}
