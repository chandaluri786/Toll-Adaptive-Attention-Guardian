// OWNER: A (Spec A — task A6). The screen judges look at most; the polish budget goes here (A12).
// Reached two ways: the blocker's deep link toll://blocked?app=&package=&reason= (route
// src/app/blocked.tsx), or from the dev menu. Strict order: weather + reason, umbrella time, choices.
import React, { useState } from 'react';
import { Text } from 'react-native';
import services from '../../services';
import { useBalance, usePosture } from '../../shared/hooks';
import { BalanceNumeral, Button, Placeholder, ReasonLine, WeatherChip, useTheme } from '../../ui/components';

export default function StormScreen({ appName, reason }: { appName?: string; reason?: string }) {
  const t = useTheme();
  const state = usePosture();
  const balance = useBalance();
  const [note, setNote] = useState('');
  const emergencyLeft = services.governor.emergencyLeftToday();

  return (
    <Placeholder title={`You opened ${appName ?? 'a distracting app'}`} owner="A" tasks="A3, A5, A6">
      {state.grace && <Text style={{ color: t.textMuted }}>Clouds gathering — nothing changes for 90 seconds.</Text>}
      <WeatherChip posture={state.posture} />
      <ReasonLine text={state.reason} />
      {reason === 'expired' && <Text style={{ color: t.textMuted }}>Your umbrella time just ran out.</Text>}
      <BalanceNumeral minutes={balance} />
      <Button title="Wait 60 seconds" onPress={() => setNote('Waiting… (A6: countdown, grants nothing)')} />
      {state.posture === 'metered' && (
        <Button
          title="Open umbrella — 15 min"
          onPress={() => {
            const r = services.ledger.spend(15, 'restricted');
            setNote(r.ok ? 'Umbrella up for 15 minutes.' : `You need ${r.shortfall} more minutes.`);
          }}
        />
      )}
      <Button
        primary={state.posture === 'sealed'}
        title="Take a quest"
        onPress={() => services.quests.openSheet({ from: 'storm_screen', posture: state.posture })}
      />
      <Button
        title={emergencyLeft ? 'Emergency unlock (1 left today)' : 'Emergency unlock used. Back tomorrow.'}
        onPress={() => {
          // A5: two taps plus a confirm dialog before calling this.
          const w = services.governor.emergencyUnlock();
          setNote(w ? 'Every app opens for 15 minutes.' : 'Emergency unlock used. Back tomorrow.');
        }}
      />
      {!!note && <Text style={{ color: t.textMuted }}>{note}</Text>}
    </Placeholder>
  );
}
