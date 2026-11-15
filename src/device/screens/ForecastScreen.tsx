// OWNER: A (Spec A — tasks A11 week view, A13 month / 6 months). Reads Ledger.history() only;
// everything is computed on the phone.
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import services from '../../services';
import { Placeholder, useTheme } from '../../ui/components';

export default function ForecastScreen() {
  const t = useTheme();
  const week = useMemo(() => services.ledger.history(7), []);
  return (
    <Placeholder title="Forecast" owner="A" tasks="A11, A13">
      <Text style={{ color: t.textMuted }}>How the weather's been treating you — last 7 days (fake history)</Text>
      {week.map((d) => (
        <Text key={d.date} style={{ color: t.text }}>
          {d.date} · {d.restrictedMin} min distracting · {d.pastFreeMin} past free time ·{' '}
          {d.tasksPlanned === null ? `no plan, ${d.tasksDone} done` : `${d.tasksDone}/${d.tasksPlanned} tasks`}
        </Text>
      ))}
    </Placeholder>
  );
}
