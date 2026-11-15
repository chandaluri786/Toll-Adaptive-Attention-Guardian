// OWNER: A (src/ui). Motion helpers. Every animation in the app goes through these so "reduce motion"
// is honoured in one place (planning doc, Accessibility: reduce-motion respected).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/** True when the user asked the system to reduce motion. Updates live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** The native driver is not available in the browser preview. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * A value that loops 0 -> 1 forever, linear. Returns a static 0 when motion is reduced.
 * `durationMs` is one full loop.
 */
export function useLoop(durationMs: number, reduced: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(value, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER }),
    );
    loop.start();
    return () => loop.stop();
  }, [durationMs, reduced, value]);
  return value;
}

/**
 * The design's "tollOpen" entrance (0.9 s): the umbrella pops in, scaling .3 -> 1.08 -> 1 while it turns
 * from -30deg to 4deg to 0 and fades in. Returns an Animated style; static (fully visible) when reduced.
 */
export function useOpenIn(reduced: boolean) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    // cubic-bezier(.2,.9,.3,1.2): a quick start with a small overshoot
    Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.bezier(0.2, 0.9, 0.3, 1.2), useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [reduced, v]);
  return {
    // 60% of the way through the design is the overshoot keyframe (scale 1.08, 4deg); the easing supplies it
    opacity: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 1.08, 1] }) },
      { rotate: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-30deg', '4deg', '0deg'] }) },
    ],
  };
}
