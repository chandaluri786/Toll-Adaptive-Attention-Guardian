// OWNER: B. Small React hooks for B's screens (UI only; pure logic and tests never import this).
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import services from '../services';

/** The shared clock's time, refreshed every `intervalMs` while `enabled` (countdowns, live rings). */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => services.clock.now());
  useEffect(() => {
    setNow(services.clock.now());
    if (!enabled) return;
    const id = setInterval(() => setNow(services.clock.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

// DESIGN: swap to src/ui/motion.ts when src/ui ships it (it owns the reduce-motion rule).
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduce(on))
      .catch(() => alive && setReduce(true));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
