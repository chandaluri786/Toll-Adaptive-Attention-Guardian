// OWNER: all three, written at hour 0. Routes only import each owner's screen; nobody edits this
// after 1:30. Every file in src/app is a route — keep other code outside this folder.
import React from 'react';
import { Stack } from 'expo-router';
import DeviceRuntime from '../device/DeviceRuntime';
import { FontGate } from '../ui/FontGate';
import QuestSheetHost from '../day/screens/QuestSheetHost';
import PlanMyDaySheet from '../day/screens/PlanMyDaySheet';

export default function RootLayout() {
  return (
    <FontGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="blocked" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="demo" options={{ headerShown: true, title: 'Demo panel' }} />
        <Stack.Screen name="gallery" />
      </Stack>
      <DeviceRuntime />
      <QuestSheetHost />
      <PlanMyDaySheet />
    </FontGate>
  );
}
