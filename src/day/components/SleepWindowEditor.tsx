// OWNER: B (B1). Sleep window, default 23:00–07:00, capped at 10 hours.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../ui/components';
import { space } from '../../ui/theme';
import { getPlannerStore, usePlannerState } from '../store';
import { Field, Note } from './fields';

export default function SleepWindowEditor() {
  const { sleep } = usePlannerState();
  const [start, setStart] = useState(sleep.start);
  const [end, setEnd] = useState(sleep.end);
  const [note, setNote] = useState<string | null>(null);

  const save = () => {
    const r = getPlannerStore().setSleep({ start: start.trim(), end: end.trim() });
    setNote(r.ok ? 'Saved.' : r.error);
  };

  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Field label="Bedtime" value={start} onChangeText={setStart} placeholder="23:00" width={110} />
        <Field label="Wake up" value={end} onChangeText={setEnd} placeholder="07:00" width={110} />
      </View>
      <Note>{note ?? 'Up to 10 hours.'}</Note>
      <Button title="Save sleep window" onPress={save} />
    </View>
  );
}
