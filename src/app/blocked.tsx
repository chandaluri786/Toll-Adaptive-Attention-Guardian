// Route → A's Storm screen (Spec A, task A6).
// expo-app-blocker opens toll://blocked?app=<Name>&package=<pkg>&reason=opened|expired, which lands here.
import React, { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import StormScreen from '../device/screens/StormScreen';

export default function Blocked() {
  const { app, package: pkg, reason, weather, balance } = useLocalSearchParams<{ app?: string; package?: string; reason?: string; weather?: string; balance?: string }>();

  // Reached from the blocker (`reason` is set): the hardware Back goes to the home screen, like the screen's own
  // buttons, not into Toll's tabs. The stack is anchored on (tabs), so the default Back would pop to them.
  useEffect(() => {
    if (!reason || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [reason]);

  return <StormScreen appName={app} pkg={pkg} reason={reason} weather={weather} balance={balance} />;
}
