// OWNER: A (Spec A — task A8). Rendered inside C's Settings container.
// Adding an app applies at once; removing one takes effect after 12 hours.
import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../ui/components';

export default function RestrictedAppsSection() {
  const t = useTheme();
  return (
    <Text style={{ color: t.text }}>
      Distracting apps (A8) · always-open messaging apps · "Removing one takes 12 hours."
    </Text>
  );
}
