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
