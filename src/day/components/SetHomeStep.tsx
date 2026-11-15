// OWNER: B (Spec B — task B1). Rendered as step 3 of A's onboarding. "Use my current location";
// home stays on the phone and is only used for away-from-home quests. Skipping is always fine.
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { space, type as font } from '../../ui/theme';
import HomePicker from './HomePicker';

export default function SetHomeStep() {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <Text style={{ color: t.text, fontSize: font.title, fontWeight: '700' }}>Where's home?</Text>
      <Text style={{ color: t.text, fontSize: font.body }}>
        Quests like a gym visit or a meetup check that you're more than 500 m from home. Home never leaves this phone.
      </Text>
      <HomePicker />
    </View>
  );
}
