// Route → A's Storm screen (Spec A, task A6).
// expo-app-blocker opens toll://blocked?app=<Name>&package=<pkg>&reason=opened|expired, which lands here.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import StormScreen from '../device/screens/StormScreen';

export default function Blocked() {
  const { app, package: pkg, reason, weather } = useLocalSearchParams<{ app?: string; package?: string; reason?: string; weather?: string }>();
  return <StormScreen appName={app} pkg={pkg} reason={reason} weather={weather} />;
}
