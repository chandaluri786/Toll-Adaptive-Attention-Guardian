// OWNER: C (Spec C — task C7). Weather thresholds, shown on purpose so they can be changed live on
// stage, plus the Focus Pressure explainer from the design.
import React from 'react';
import { Text } from 'react-native';
import { usePosture } from '../../shared/hooks';
import { useTheme } from '../../ui/components';

export default function EngineSection() {
  const t = useTheme();
  const s = usePosture();
  return (
    <Text style={{ color: t.text }}>
      Focus Pressure right now: {s.score} · Cloudy at 35 · Storm at 65 (C7: editable thresholds). Only counts after
      free time runs out.
    </Text>
  );
}
