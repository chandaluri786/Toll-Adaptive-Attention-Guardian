// OWNER: B (Spec B — task B2). Optional, never forced: opened from the morning/noon reminder or
// Today. 1–7 typed tasks; locks 30 min after Start; "Not today" always visible.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import services from '../../services';
import { Button, useTheme } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Display } from '../../ui/primitives';
import { fonts, radius, space, touch, type as font } from '../../ui/theme';
import TaskDraftRow, { type DraftTask } from '../components/TaskDraftRow';
import { Note, SectionTitle } from '../components/fields';
import { TextLink } from '../components/sheet/SheetParts';
import { TASK_ICON } from '../components/taskIcon';
import { planSheetRequests } from '../fakes';
import { createPlanActions, forecastLine, isLocked, MAX_TASKS, TASK_LABELS, yesterdaysUnfinished, type NewTask } from '../plan';
import { todaysPlan, type DayPlan } from '../planner';
import { getPlannerStore, usePlannerState } from '../store';

const LOCK_NOTE = 'Locks in 30 minutes; later tasks earn half.';
let draftSeq = 0;
const draft = (task: NewTask = { type: 'fitness', title: '' }): DraftTask => ({ ...task, key: `d-${draftSeq++}` });
const now = () => services.clock.now();

function usePlanActions() {
  return useMemo(() => createPlanActions(getPlannerStore(), { now }), []);
}

/** Before Start: build 1–7 tasks, optionally bringing back yesterday's unfinished ones. */
function NewPlan({ onDone }: { onDone: () => void }) {
  const actions = usePlanActions();
  const state = usePlannerState();
  const leftovers = yesterdaysUnfinished(state, now());
  const [rows, setRows] = useState<DraftTask[]>(() => [draft()]);
  const [note, setNote] = useState<string | null>(null);

  const update = (row: DraftTask) => setRows((rs) => rs.map((r) => (r.key === row.key ? row : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const bringBack = () => {
    const empty = (r: DraftTask) => r.title.trim() === '';
    setRows((rs) => [...rs.filter((r) => !empty(r)), ...leftovers.map((t) => draft(t))].slice(0, MAX_TASKS));
  };
  const start = () => {
    const r = actions.startPlan(rows.map(({ key: _key, ...task }) => task));
    if (r.ok) onDone();
    else setNote(r.error);
  };

  return (
    <View style={{ gap: space.m }}>
      {leftovers.length > 0 ? (
        <View style={{ gap: space.s }}>
          <Note>{`From yesterday: ${leftovers.map((t) => t.title).join(', ')}`}</Note>
          <Button title="Bring them into today" onPress={bringBack} />
        </View>
      ) : null}
      {rows.map((row) => (
        <TaskDraftRow key={row.key} task={row} onChange={update} onRemove={rows.length > 1 ? () => remove(row.key) : undefined} />
      ))}
      {rows.length < MAX_TASKS ? <Button title="Add a task" onPress={() => setRows((rs) => [...rs, draft()])} /> : <Note>{`Up to ${MAX_TASKS} tasks a day.`}</Note>}
      <Note>{note}</Note>
      <Button primary title="Start the day" onPress={start} />
      <Note>{LOCK_NOTE}</Note>
    </View>
  );
}

/** After Start: today's tasks, removable until the lock; more can be added (half after the lock). */
function StartedPlan({ plan }: { plan: DayPlan }) {
  const t = useTheme();
  const actions = usePlanActions();
  const locked = isLocked(plan, now());
  const [row, setRow] = useState<DraftTask>(() => draft());
  const [note, setNote] = useState<string | null>(null);

  const add = () => {
    const r = actions.addTask(row);
    setNote(r.ok ? null : r.error);
    if (r.ok) setRow(draft());
  };
  const remove = (id: string) => {
    const r = actions.removeTask(id);
    setNote(r.ok ? null : r.error);
  };

  return (
    <View style={{ gap: space.m }}>
      <Note>{locked ? 'Locked in for today. New tasks earn half.' : LOCK_NOTE}</Note>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>Tasks</Text>
        <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>{`${plan.tasks.length} of ${MAX_TASKS}`}</Text>
      </View>
      {plan.tasks.map((task) => (
        <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: t.surface, borderRadius: radius.m, paddingLeft: space.m, minHeight: touch.min + 12 }}>
          <Icon name={TASK_ICON[task.type]} size={20} color={t.muted} />
          <View style={{ flex: 1, paddingVertical: space.s }}>
            <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>{task.title}</Text>
            <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>
              {TASK_LABELS[task.type]}
              {task.topic ? ` · ${task.topic}` : ''}
              {task.rate === 0.5 ? ' · earns half' : ''}
              {task.done === 1 ? ' · done' : task.done === 0.5 ? ' · half done' : ''}
            </Text>
          </View>
          {!locked && plan.tasks.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${task.title}`}
              onPress={() => remove(task.id)}
              style={{ width: touch.min + 4, minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={20} color={t.muted} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {plan.tasks.length < MAX_TASKS ? (
        <View style={{ gap: space.s }}>
          <SectionTitle>Add a task</SectionTitle>
          <TaskDraftRow task={row} onChange={setRow} />
          <Button title="Add to today" onPress={add} />
        </View>
      ) : null}
      <Note>{note}</Note>
    </View>
  );
}

export default function PlanMyDaySheet() {
  const t = useTheme();
  const state = usePlannerState();
  const [open, setOpen] = useState(false);
  useEffect(() => planSheetRequests.on(() => setOpen(true)), []);

  const close = () => setOpen(false);
  const plan = todaysPlan(state, now());
  const notToday = () => {
    if (!plan) createPlanActions(getPlannerStore(), { now }).decline();
    close();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={{ maxHeight: '90%', backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l }}>
          <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m }}>
              <Display>Plan my day</Display>
              <TextLink gold title={plan ? 'Close' : 'Not today'} onPress={plan ? close : notToday} />
            </View>
            <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>{"Today's forecast"}</Text>
            <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>{forecastLine(state, now())}</Text>
            {open && (plan ? <StartedPlan plan={plan} /> : <NewPlan onDone={close} />)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
