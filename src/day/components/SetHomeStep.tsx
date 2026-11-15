// OWNER: B (Spec B — task B1). Rendered as step 3 of A's onboarding. "Use my current location";
// home stays on the phone and is only used for away-from-home quests.
import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../ui/components';

export default function SetHomeStep() {
  const t = useTheme();
  return <Text style={{ color: t.text }}>3 · Where's home? (B1: map + "Use my current location")</Text>;
}
