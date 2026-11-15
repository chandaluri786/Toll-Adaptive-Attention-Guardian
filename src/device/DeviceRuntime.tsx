// OWNER: A (Spec A). Mounted once in src/app/_layout.tsx. Renders nothing; it starts A's background
// work (enforcement, usage metering, notifications, permission checks) when the app opens and stops it
// when it closes, and sends a first-time user to onboarding.
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { device } from '../services';

export default function DeviceRuntime() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const navReady = useRootNavigationState()?.key;

  useEffect(() => device.kit.start(), []);

  // First launch: onboarding. Skipped in the browser preview, where state resets on every reload and the
  // gallery (/gallery) is the way in. Waits for the navigator to exist, or expo-router throws.
  useEffect(() => {
    if (Platform.OS === 'web' || !navReady) return;
    if (!device.kit.onboarding.isDone() && segments[0] !== 'onboarding') router.replace('/onboarding');
  }, [navReady, segments, router]);

  return null;
}
