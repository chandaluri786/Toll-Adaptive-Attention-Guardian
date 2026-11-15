// OWNER: B (task B9). Today's cards (2.1–2.5): umbrella time, free time, today's tasks or "No plan
// today", and the one suggested quest. Thin: every string comes from ../../today.ts.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, useTheme } from '../../../ui/components';
import { radius, space, touch, type as font } from '../../../ui/theme';
import type { TaskRow, TodayView } from '../../today';
import { Bar, Card } from '../sheet/SheetParts';

export function UmbrellaCard({ u }: { u: TodayView['umbrella'] }) {
  const t = useTheme();
  return (
    <Card>
      {/* DESIGN: umbrella icon before the label; number in fonts.display (Cormorant 600, 48) */}
      <Text style={{ color: t.textMuted, fontSize: font.body }}>Umbrella time</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <Text style={{ color: t.umbrella, fontSize: font.hero + 8, fontWeight: '600' }}>{u.minutes}</Text>
        <Text style={{ color: t.textMuted, fontSize: font.body + 4 }}>minutes</Text>
      </View>
      <Bar fraction={u.fraction} />
      {!!u.line && <Text style={{ color: t.textMuted, fontSize: font.body }}>{u.line}</Text>}
      {!!u.up && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.background, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: touch.min }}>
          {/* DESIGN: gold tint + umbrella icon */}
          <Text style={{ color: t.umbrella, fontSize: font.body + 1, fontWeight: '500' }}>Umbrella up</Text>
          <Text style={{ color: t.umbrella, fontSize: font.body + 1, fontWeight: '600' }}>{u.up}</Text>
        </View>
      )}
    </Card>
  );
}

export function FreeTimeCard({ f }: { f: TodayView['free'] }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {/* DESIGN: sun icon in the `free` blue */}
        <Text style={{ color: t.textMuted, fontSize: font.body }}>Free time</Text>
        <Text style={{ color: t.textMuted, fontSize: font.body }}>{f.resets}</Text>
      </View>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '500' }}>{f.headline}</Text>
      <Bar fraction={f.fraction} tone="free" />
    </Card>
  );
}

function TaskRowView({ row, onVerify }: { row: TaskRow; onVerify: (row: TaskRow) => void }) {
  const t = useTheme();
  const s = row.status;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch.min + 12 }}>
      {/* DESIGN: task type icon */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body + 1 }}>{row.title}</Text>
        <Text style={{ color: t.textMuted, fontSize: font.small }}>{row.meta}</Text>
      </View>
      {s.kind === 'verify' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Verify ${row.title}`}
          onPress={() => onVerify(row)}
          style={{ minHeight: touch.min, minWidth: 88, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: t.text, fontSize: font.body, fontWeight: '500' }}>Verify</Text>
        </Pressable>
      ) : (
        <Text style={{ color: s.kind === 'done' || s.kind === 'live' ? t.umbrella : t.textMuted, fontSize: font.body }}>{s.label}</Text>
      )}
    </View>
  );
}

export function TaskList({ tasks, onVerify, onPlan }: { tasks: TodayView['tasks']; onVerify: (row: TaskRow) => void; onPlan: () => void }) {
  const t = useTheme();
  if (tasks.kind === 'none') {
    return (
      <Card dashed>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '500' }}>No plan today — that's fine.</Text>
        <Text style={{ color: t.textMuted, fontSize: font.body }}>The sky works without one.</Text>
        <Button title="Plan my day" onPress={onPlan} />
      </Card>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xs }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '500' }}>
          Today's tasks
        </Text>
        <Text style={{ color: t.textMuted, fontSize: font.body }}>{tasks.count}</Text>
      </View>
      {tasks.rows.length > 0 && (
        <Card>
          {tasks.rows.map((r) => (
            <TaskRowView key={r.id} row={r} onVerify={onVerify} />
          ))}
        </Card>
      )}
    </View>
  );
}

export function SuggestedQuest({ s, onOpen }: { s: NonNullable<TodayView['suggested']>; onOpen: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Suggested quest: ${s.title}`} onPress={onOpen}>
      <Card>
        <Text style={{ color: t.textMuted, fontSize: font.body }}>Suggested quest</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '500', flex: 1 }}>{s.title}</Text>
          <Text style={{ color: t.umbrella, fontSize: font.body, fontWeight: '600' }}>{s.pays}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
