// OWNER: B (B1). Weekly timetable: typed blocks up to 4 hours, with the cap message from the
// design. Storms can only happen inside these blocks, so the cap is what keeps a storm short.
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../ui/components';
import { space, type as font } from '../../ui/theme';
import { BLOCK_LABELS, type BlockType, type WeeklyBlock } from '../planner';
import { getPlannerStore, usePlannerState } from '../store';
import { formatHHMM, isHHMM, parseHHMM } from '../time';
import { Chip, Field, Note } from './fields';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPES = Object.keys(BLOCK_LABELS) as BlockType[];
const WEEKDAYS = [1, 2, 3, 4, 5];

function BlockRow({ block }: { block: WeeklyBlock }) {
  const t = useTheme();
  const days = block.days.map((d) => DAY_NAMES[d]).join(' ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body }}>{block.title}</Text>
        <Text style={{ color: t.muted, fontSize: font.small }}>
          {BLOCK_LABELS[block.type]} · {days} · {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
        </Text>
      </View>
      <Button title="Remove" onPress={() => getPlannerStore().removeBlock(block.id)} />
    </View>
  );
}

function AddBlockForm() {
  const [type, setType] = useState<BlockType>('class');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [note, setNote] = useState<string | null>(null);

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));

  const add = () => {
    if (!isHHMM(start.trim()) || !isHHMM(end.trim())) {
      setNote('Use a time like 10:00');
      return;
    }
    const r = getPlannerStore().addBlock({
      type,
      title: title.trim() || BLOCK_LABELS[type],
      days,
      startMin: parseHHMM(start.trim()),
      endMin: parseHHMM(end.trim()),
    });
    setNote(r.ok ? null : r.error);
    if (r.ok) setTitle('');
  };

  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {TYPES.map((ty) => <Chip key={ty} label={BLOCK_LABELS[ty]} selected={type === ty} onPress={() => setType(ty)} />)}
      </View>
      <Field label="Name" value={title} onChangeText={setTitle} placeholder="Algorithms" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {DAY_LETTERS.map((l, d) => <Chip key={d} label={l} selected={days.includes(d)} onPress={() => toggleDay(d)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Field label="Starts" value={start} onChangeText={setStart} placeholder="10:00" width={110} />
        <Field label="Ends" value={end} onChangeText={setEnd} placeholder="11:00" width={110} />
      </View>
      <Note>{note ?? 'Blocks can be up to 4 hours.'}</Note>
      <Button title="Add block" onPress={add} />
    </View>
  );
}

export default function TimetableEditor() {
  const { blocks } = usePlannerState();
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  return (
    <View style={{ gap: space.m }}>
      {sorted.length === 0 ? <Note>No timetable yet — add one for a smarter forecast.</Note> : sorted.map((b) => <BlockRow key={b.id} block={b} />)}
      <AddBlockForm />
    </View>
  );
}
