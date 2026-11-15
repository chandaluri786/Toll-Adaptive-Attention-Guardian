// OWNER: B (task B9). Today's cards (2.1–2.5): umbrella time, free time, today's tasks or "No plan
// today", and the one suggested quest. Thin: every string comes from ../../today.ts.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BalanceNumeral, Button, useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { fonts, radius, space, touch, type as font } from '../../../ui/theme';
import type { TaskRow, TodayView } from '../../today';
import { Bar, Card } from '../sheet/SheetParts';
import { TASK_ICON } from '../taskIcon';

const HEADLINE = { fontSize: 20, fontFamily: fonts.medium } as const;
const BODY = { fontSize: font.body, fontFamily: fonts.body } as const;
const SMALL = { fontSize: font.small, fontFamily: fonts.body } as const;

function CardLabel({ icon, color, children }: { icon: 'umbrella' | 'sun'; color: string; children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      <Icon name={icon} size={18} color={color} />
      <Text style={{ color: t.muted, ...BODY }}>{children}</Text>
    </View>
  );
}

export function UmbrellaCard({ u }: { u: TodayView['umbrella'] }) {
  const t = useTheme();
  return (
    <Card>
      <CardLabel icon="umbrella" color={t.gold}>Umbrella time</CardLabel>
      <BalanceNumeral minutes={u.minutes} size={font.hero + 8} />
      <Bar fraction={u.fraction} />
      {!!u.line && <Text style={{ color: t.muted, ...BODY }}>{u.line}</Text>}
      {!!u.up && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.goldTint, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: touch.min }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Icon name="umbrella" size={18} color={t.goldTintText} />
            <Text style={{ color: t.goldTintText, fontSize: font.body + 1, fontFamily: fonts.medium }}>Umbrella up</Text>
          </View>
          <Text style={{ color: t.goldTintText, fontSize: font.body + 1, fontFamily: fonts.bold }}>{u.up}</Text>
        </View>
      )}
    </Card>
  );
}

export function FreeTimeCard({ f }: { f: TodayView['free'] }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <CardLabel icon="sun" color={t.free}>Free time</CardLabel>
        <Text style={{ color: t.muted, ...BODY }}>{f.resets}</Text>
      </View>
      <Text style={{ color: t.text, ...HEADLINE }}>{f.headline}</Text>
      <Bar fraction={f.fraction} tone="free" />
    </Card>
  );
}

function TaskRowView({ row, onVerify }: { row: TaskRow; onVerify: (row: TaskRow) => void }) {
  const t = useTheme();
  const s = row.status;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: touch.min + 12 }}>
      <Icon name={TASK_ICON[row.type]} size={20} color={t.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: font.body + 1, fontFamily: fonts.body }}>{row.title}</Text>
        <Text style={{ color: t.muted, ...SMALL }}>{row.meta}</Text>
      </View>
      {s.kind === 'verify' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Verify ${row.title}`}
          onPress={() => onVerify(row)}
          style={{ minHeight: touch.min, minWidth: 88, paddingHorizontal: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: t.gold, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: t.primaryText, fontSize: font.body, fontFamily: fonts.medium }}>Verify</Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {s.kind === 'done' && <Icon name="check" size={18} color={t.good} />}
          <Text style={{ color: s.kind === 'done' ? t.good : s.kind === 'live' ? t.goldText : t.muted, ...BODY }}>{s.label}</Text>
        </View>
      )}
    </View>
  );
}

export function TaskList({ tasks, onVerify, onPlan }: { tasks: TodayView['tasks']; onVerify: (row: TaskRow) => void; onPlan: () => void }) {
  const t = useTheme();
  if (tasks.kind === 'none') {
    return (
      <Card dashed>
        <Text style={{ color: t.text, ...HEADLINE }}>No plan today — that's fine.</Text>
        <Text style={{ color: t.muted, ...BODY }}>The sky works without one.</Text>
        <Button title="Plan my day" onPress={onPlan} />
      </Card>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xs }}>
        <Text accessibilityRole="header" style={{ color: t.text, ...HEADLINE }}>
          Today's tasks
        </Text>
        <Text style={{ color: t.muted, ...BODY }}>{tasks.count}</Text>
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
        <Text style={{ color: t.muted, ...BODY }}>Suggested quest</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m }}>
          <Icon name={TASK_ICON[s.type]} size={22} color={t.text} />
          <Text style={{ color: t.text, ...HEADLINE, flex: 1 }}>{s.title}</Text>
          <Text style={{ color: t.goldText, fontSize: font.body, fontFamily: fonts.medium }}>{s.pays}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
