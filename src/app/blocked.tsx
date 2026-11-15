// Route → A's Storm screen (Spec A, task A6).
// expo-app-blocker opens toll://blocked?app=<Name>&package=<pkg>&reason=opened|expired, which lands here.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import StormScreen from '../device/screens/StormScreen';

export default function Blocked() {
  const { app, reason } = useLocalSearchParams<{ app?: string; package?: string; reason?: string }>();
  return <StormScreen appName={app} reason={reason} />;
}
