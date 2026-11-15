// OWNER: all three, written at hour 0. Routes only import each owner's screen; nobody edits this
// after 1:30. Every file in src/app is a route — keep other code outside this folder.
import React from 'react';
import { Stack } from 'expo-router';
import QuestSheetHost from '../day/screens/QuestSheetHost';
import PlanMyDaySheet from '../day/screens/PlanMyDaySheet';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="blocked" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="demo" options={{ headerShown: true, title: 'Demo panel' }} />
      </Stack>
      <QuestSheetHost />
      <PlanMyDaySheet />
    </>
  );
}
