// OWNER: A (src/ui). Loads the design's fonts before the first screen shows, so the big serif weather
// word never flashes in the wrong font. Cormorant Garamond for display, Roboto for everything else.
//
// It never blocks forever: if a font fails to load (or takes over 3 s), the app renders with the system
// font rather than showing a blank screen.
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useFonts } from 'expo-font';
import React, { useEffect, useState } from 'react';

const GIVE_UP_AFTER_MS = 3000;

export function FontGate({ children }: { children: React.ReactNode }) {
  const [loaded, error] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), GIVE_UP_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  if (!loaded && !error && !timedOut) return null;
  return <>{children}</>;
}
