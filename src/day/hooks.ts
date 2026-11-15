// OWNER: B. Small React hooks for B's screens (UI only; pure logic and tests never import this).
import { useEffect, useState } from 'react';
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

// Reduce-motion lives in src/ui/motion.ts (useReducedMotion); B's screens use that.
