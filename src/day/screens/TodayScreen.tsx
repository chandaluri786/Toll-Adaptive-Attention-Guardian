// OWNER: B (Spec B — task B9). Sky scene with weather + reason + next change, umbrella time,
// free-time meter, today's tasks (or "No plan today — that's fine"), one suggested quest.
import React, { useSyncExternalStore } from 'react';
import { Text } from 'react-native';
import services from '../../services';
import { useBalance, usePosture } from '../../shared/hooks';
import { BalanceNumeral, Button, Placeholder, ReasonLine, WeatherChip, useTheme } from '../../ui/components';

export default function TodayScreen() {
  const t = useTheme();
  const state = usePosture();
  const balance = useBalance();
  const progress = useSyncExternalStore(
    (cb) => services.planner.onChange(cb),
    () => {
      const p = services.planner.progress();
      return `${p.done}/${p.total}`;
    },
  );
  const [done, total] = progress.split('/').map(Number);
  const h = Math.floor(state.allowanceLeftMin / 60);
  const m = state.allowanceLeftMin % 60;

  return (
    <Placeholder title="Today" owner="B" tasks="B9">
      <WeatherChip posture={state.posture} />
      <ReasonLine text={state.reason} />
      <BalanceNumeral minutes={balance} />
      <Text style={{ color: t.textMuted }}>
        Free time: {h} h {m} m left · resets 04:00
      </Text>
      {total > 0 ? (
        <Text style={{ color: t.text }}>
          Today's tasks: {done} of {total} done
        </Text>
      ) : (
        <Text style={{ color: t.text }}>No plan today — that's fine. The sky works without one.</Text>
      )}
      <Button title="Plan my day" onPress={() => services.planner.openPlanSheet()} />
      <Button
        primary
        title="Suggested quest: walk 2,000 steps (+25 min)"
        onPress={() => services.quests.openSheet({ from: 'today', posture: state.posture })}
      />
    </Placeholder>
  );
}
