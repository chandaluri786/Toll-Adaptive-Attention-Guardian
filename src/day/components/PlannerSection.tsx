// OWNER: B (Spec B — task B1). Rendered inside C's Settings container: home, sleep window, and the
// timetable editor (blocks up to 4 h, sleep up to 10 h, with the cap message from the design).
import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../../ui/components';

export default function PlannerSection() {
  const t = useTheme();
  return <Text style={{ color: t.text }}>Home · sleep 23:00–07:00 · timetable editor (B1)</Text>;
}
