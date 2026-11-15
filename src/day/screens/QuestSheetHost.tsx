// OWNER: B (Spec B — tasks B3, B8). Always mounted in src/app/_layout.tsx; opens when anyone calls
// Quests.openSheet(). Offer → in progress (live readout) → result. Never red, never "failed".
import React, { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { debug } from '../../services';
import { sheetRequests, type SheetRequest } from '../fakes';
import { Button, useTheme } from '../../ui/components';
import { space } from '../../ui/theme';

export default function QuestSheetHost() {
  const t = useTheme();
  const [req, setReq] = useState<SheetRequest | null>(null);
  const [result, setResult] = useState('');
  useEffect(() => sheetRequests.on((r) => {
    setReq(r);
    setResult('');
  }), []);

  return (
    <Modal visible={!!req} transparent animationType="slide" onRequestClose={() => setReq(null)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.surface, padding: space.l, gap: space.m, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Quest · Walk 2,000 steps</Text>
          <Text style={{ color: t.textMuted }}>Placeholder sheet (B8) · opened from {req?.from}</Text>
          {!!result && <Text style={{ color: t.text }}>{result}</Text>}
          <Button
            primary
            title="Pass (fake)"
            onPress={() => {
              debug.day.passActive();
              setResult(req?.posture === 'sealed' ? 'Passed — umbrella up straight away.' : 'Passed — 25 minutes dropped into your umbrella.');
            }}
          />
          <Button title="Not quite yet (fake miss)" onPress={() => setResult("You're 200 m from home — need 500 m. Try again in 5 min.")} />
          <Button title="Close" onPress={() => setReq(null)} />
        </View>
      </View>
    </Modal>
  );
}
