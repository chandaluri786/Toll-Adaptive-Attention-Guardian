// OWNER: A (src/ui, task A12). The full-bleed animated sky behind the Storm screen, Today and onboarding.
// A port of the approved design's "scene" component: gradient sky, sun / moon / stars, drifting clouds,
// rain, a rare lightning flash, and "calm" (the Storm settling while the user waits 60 seconds).
//
// Behind a screen it fills its parent (position: absolute). `quiet` fades the clouds on screens that
// need to stay readable. With "reduce motion" on, everything renders still. No red anywhere.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Posture } from '../contracts';
import { useThemeMode } from './components';
import { USE_NATIVE_DRIVER, useReducedMotion } from './motion';
import { SKY, type ThemeMode } from './theme';
import { weatherFor } from './weather';

export type SkySceneProps = {
  posture: Posture;
  /** Force light/dark. Defaults to the current theme. */
  mode?: ThemeMode;
  /** 0..1: how settled a Storm is. Rain thins and the sky drifts toward Cloudy. */
  calm?: number;
  quiet?: boolean;
  flash?: boolean;
  /** Fixed height. Omit to fill the parent. */
  height?: number;
};

/** The design's seeded pseudo-random, so stars and rain sit in the same places every render. */
const rand = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// [left %, top %, scale, colour index, drift seconds, delay seconds]: straight from the design.
type CloudSpec = [number, number, number, number, number, number];
const LAYOUT: Record<Posture, CloudSpec[]> = {
  open: [[6, 26, 0.7, 0, 14, 0], [52, 62, 0.55, 0, 18, 2]],
  metered: [[-6, 14, 1.1, 1, 16, 0], [48, 24, 1.3, 0, 20, 1], [10, 48, 0.9, 0, 14, 2], [62, 58, 1, 1, 18, 0], [-10, 72, 1.2, 1, 22, 3]],
  sealed: [[-12, 4, 1.6, 0, 18, 0], [40, 10, 1.7, 1, 22, 1], [8, 30, 1.3, 1, 16, 2], [60, 36, 1.4, 0, 20, 0], [-8, 54, 1.2, 0, 24, 3]],
};
const CLOUD_COLORS: Record<ThemeMode, Record<Posture, [string, number][]>> = {
  light: {
    open: [['#ffffff', 0.95]],
    metered: [['#ffffff', 0.92], ['#d8d5e8', 0.95]],
    sealed: [['#3b2f80', 0.98], ['#4c3d96', 0.95]],
  },
  dark: {
    open: [['#33457c', 0.7]],
    metered: [['#4d4b6b', 0.95], ['#5d5b7d', 0.9]],
    sealed: [['#2a2160', 0.98], ['#3a2e7a', 0.95]],
  },
};

/** An animated value that goes 0 -> 1 -> 0 forever (a gentle sway). Still when motion is reduced. */
function useSway(seconds: number, delaySeconds: number, reduced: boolean) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(0.5);
      return;
    }
    v.setValue(0);
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: seconds * 1000, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(v, { toValue: 0, duration: seconds * 1000, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delaySeconds * 1000);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [seconds, delaySeconds, reduced, v]);
  return v;
}

function Cloud({ spec, color, opacity, quiet, reduced }: { spec: CloudSpec; color: string; opacity: number; quiet: boolean; reduced: boolean }) {
  const [x, y, s, , dur, delay] = spec;
  const sway = useSway(dur, delay, reduced);
  const translateX = sway.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] });
  const bg = { backgroundColor: color, borderRadius: 99 } as const;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${quiet ? y * 0.7 : y}%`,
        width: 130 * s,
        height: 64 * s,
        opacity: quiet ? opacity * 0.5 : opacity,
        transform: [{ translateX }],
      }}
    >
      <View style={[bg, { position: 'absolute', left: 0, right: 0, bottom: 0, height: 34 * s }]} />
      <View style={[bg, { position: 'absolute', left: 22 * s, bottom: 12 * s, width: 52 * s, height: 52 * s }]} />
      <View style={[bg, { position: 'absolute', left: 60 * s, bottom: 10 * s, width: 42 * s, height: 42 * s }]} />
    </Animated.View>
  );
}

function Stars({ count, reduced }: { count: number; reduced: boolean }) {
  const twinkle = useSway(3, 0, reduced);
  const opacity = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => {
        const size = 1 + rand(i, 3) * 2;
        return (
          <View
            key={i}
            style={{ position: 'absolute', left: `${rand(i, 1) * 100}%`, top: `${rand(i, 2) * 62}%`, width: size, height: size, borderRadius: 9, backgroundColor: '#fff', opacity: 0.7 }}
          />
        );
      })}
    </Animated.View>
  );
}

/** A sun or a moon: a soft glow and a radial-gradient disc. */
function Orb({ right, top, size, stops, glow, glowSize, id }: { right: number; top: number; size: number; stops: [string, string, string]; glow: string; glowSize: number; id: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right, top, width: size, height: size }}>
      <View style={{ position: 'absolute', left: -glowSize, top: -glowSize, right: -glowSize, bottom: -glowSize, borderRadius: 999, backgroundColor: glow }} />
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="40%" cy="38%" r="65%">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.55" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function Rain({ width, height, calm, reduced }: { width: number; height: number; calm: number; reduced: boolean }) {
  const fall = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || height <= 0) return;
    fall.setValue(0);
    const loop = Animated.loop(Animated.timing(fall, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [reduced, height, fall]);

  const count = Math.round(30 * (1 - calm * 0.85));
  const drops = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ x: rand(i, 7) * (width + 8) - 4, y: rand(i, 8) * height, len: 16 + rand(i, 9) * 10 })),
    [count, width, height],
  );
  // Two copies one screen-height apart; sliding by exactly one height makes the loop seamless.
  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-height, 0] });
  const layer = (offset: number) =>
    drops.map((d, i) => (
      <View
        key={`${offset}-${i}`}
        style={{ position: 'absolute', left: d.x, top: d.y + offset, width: 1.5, height: d.len, borderRadius: 2, backgroundColor: 'rgba(214,208,255,.55)', transform: [{ rotate: '14deg' }] }}
      />
    ));
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: height * 2, opacity: 1 - calm * 0.6, transform: reduced ? [] : [{ translateY }] }}>
      {layer(0)}
      {!reduced && layer(height)}
    </Animated.View>
  );
}

function Flash({ reduced }: { reduced: boolean }) {
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const t = (to: number, ms: number) => Animated.timing(o, { toValue: to, duration: ms, useNativeDriver: USE_NATIVE_DRIVER });
    // One quick double flash every ~9 seconds, as in the design.
    const loop = Animated.loop(Animated.sequence([Animated.delay(8100), t(0.22, 80), t(0, 135), t(0.12, 270), t(0, 270), Animated.delay(145)]));
    const start = setTimeout(() => loop.start(), 2000);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [reduced, o]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#e9e4ff', opacity: o }]} />;
}

export function SkyScene({ posture, mode, calm = 0, quiet = false, flash = true, height }: SkySceneProps) {
  const themeMode = useThemeMode();
  const dark = (mode ?? themeMode) === 'dark';
  const m: ThemeMode = dark ? 'dark' : 'light';
  const reduced = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState({ w: 360, h: height ?? 780 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const c = calm < 0 ? 0 : calm > 1 ? 1 : calm;
  const sky = SKY[m][posture];
  const meteredSky = SKY[m].metered;
  const isQuiet = quiet && posture !== 'sealed';
  const palette = CLOUD_COLORS[m][posture];

  return (
    <View
      onLayout={onLayout}
      style={[height ? { height, width: '100%' } : StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${weatherFor(posture).name} sky`}
    >
      {/* sky gradient (+ a second one that fades in as a Storm calms) */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="1" stopColor={sky.bottom} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#g${uid})`} />
      </Svg>
      {posture === 'sealed' && c > 0 && (
        <Svg width="100%" height="100%" style={[StyleSheet.absoluteFill, { opacity: c * 0.75 }]}>
          <Defs>
            <LinearGradient id={`m${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={meteredSky.top} />
              <Stop offset="1" stopColor={meteredSky.bottom} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#m${uid})`} />
        </Svg>
      )}

      {dark && <Stars count={posture === 'open' ? 34 : posture === 'metered' ? 16 : 8} reduced={reduced} />}

      {posture === 'open' && !dark && (
        <Orb id={`s${uid}`} right={30} top={54} size={86} stops={['#fff2b8', '#ffd25a', '#ffbf3a']} glow="rgba(255,214,102,.22)" glowSize={14} />
      )}
      {posture === 'open' && dark && (
        <Orb id={`o${uid}`} right={40} top={60} size={58} stops={['#fffbea', '#efe6c6', '#d9cfa9']} glow="rgba(240,230,190,.16)" glowSize={18} />
      )}
      {posture === 'metered' && !dark && (
        <View pointerEvents="none" style={{ position: 'absolute', right: 46, top: 56, width: 70, height: 70, borderRadius: 99, backgroundColor: '#fbe3a6', opacity: 0.55 }} />
      )}

      {LAYOUT[posture].map((spec, i) => {
        const [color, op] = palette[Math.min(spec[3], palette.length - 1)];
        return <Cloud key={i} spec={spec} color={color} opacity={op} quiet={isQuiet} reduced={reduced} />;
      })}

      {posture === 'sealed' && <Rain width={size.w} height={size.h} calm={c} reduced={reduced} />}
      {posture === 'sealed' && !reduced && c < 0.3 && flash && <Flash reduced={reduced} />}
    </View>
  );
}
