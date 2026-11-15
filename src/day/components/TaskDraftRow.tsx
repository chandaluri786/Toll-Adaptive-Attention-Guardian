// OWNER: B (B2). One editable task in the Plan my day sheet: type picker, name, and a topic for
// study tasks (the quiz uses it). The type is fixed once the day starts.
import React from 'react';
import { View } from 'react-native';
import { Button, useTheme } from '../../ui/components';
import { radius, space } from '../../ui/theme';
import type { TaskType } from '../../contracts';
import { TASK_LABELS, TASK_TYPES, type NewTask } from '../plan';
import { Chip, Field } from './fields';

export type DraftTask = NewTask & { key: string };

const PLACEHOLDERS: Record<TaskType, string> = {
  fitness: 'Walk to campus',
  place: 'Library session',
  meetup: 'Coffee with a friend',
  study: 'Review lecture notes',
  coding: 'Push the parser fix',
  focus: 'Phone-down reading',
};

export default function TaskDraftRow(props: {
  task: DraftTask;
  onChange: (task: DraftTask) => void;
  onRemove?: () => void;
}) {
  const t = useTheme();
  const { task, onChange } = props;
  return (
    <View style={{ gap: space.s, padding: space.s, borderWidth: 1, borderColor: t.divider, borderRadius: radius.m }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {TASK_TYPES.map((ty) => (
          <Chip key={ty} label={TASK_LABELS[ty]} selected={task.type === ty} onPress={() => onChange({ ...task, type: ty })} />
        ))}
      </View>
      <Field label="Task" value={task.title} onChangeText={(title) => onChange({ ...task, title })} placeholder={PLACEHOLDERS[task.type]} />
      {task.type === 'study' ? (
        <Field label="Topic (for the quiz)" value={task.topic ?? ''} onChangeText={(topic) => onChange({ ...task, topic })} placeholder="Dijkstra's algorithm" />
      ) : null}
      {props.onRemove ? <Button title="Remove" onPress={props.onRemove} /> : null}
    </View>
  );
}
