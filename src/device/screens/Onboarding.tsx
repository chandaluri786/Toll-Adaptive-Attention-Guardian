// OWNER: A (Spec A — task A7). Four steps: meet the weather · permissions (6 live dots, polled on
// resume, never blocking) · set home (B's SetHomeStep) · distracting apps + up to 2 always-open
// messaging apps. Sleep defaults to 23:00–07:00.
import React from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import SetHomeStep from '../../day/components/SetHomeStep';
import { Button, Placeholder, useTheme } from '../../ui/components';

export default function Onboarding() {
  const t = useTheme();
  return (
    <Placeholder title="Your phone has weather now." owner="A" tasks="A7, A8">
      <Text style={{ color: t.text }}>1 · Meet the weather</Text>
      <Text style={{ color: t.text }}>2 · A few permissions (usage access, overlay, location, camera, motion, notifications)</Text>
      <SetHomeStep />
      <Text style={{ color: t.text }}>4 · What pulls you in? + up to 2 always-open messaging apps</Text>
      <Button primary title="Done" onPress={() => router.replace('/')} />
    </Placeholder>
  );
}
