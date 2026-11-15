// OWNER: B (Spec B — task B2). Optional, never forced: opened from the morning/noon reminder or
// Today. 1–7 typed tasks; locks 30 min after Start; "Not today" always visible.
import React, { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { planSheetRequests } from '../fakes';
import { Button, useTheme } from '../../ui/components';
import { space } from '../../ui/theme';

export default function PlanMyDaySheet() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => planSheetRequests.on(() => setOpen(true)), []);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.surface, padding: space.l, gap: space.m, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Plan my day</Text>
          <Text style={{ color: t.textMuted }}>Placeholder (B2): forecast from the timetable, 1–7 typed tasks.</Text>
          <Text style={{ color: t.textMuted }}>Locks in 30 minutes; later tasks earn half.</Text>
          <Button primary title="Start the day" onPress={() => setOpen(false)} />
          <Button title="Not today" onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  );
}
