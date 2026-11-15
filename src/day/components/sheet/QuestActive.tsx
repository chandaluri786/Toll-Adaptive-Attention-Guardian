// OWNER: B (task B8). Quest sheet 3.2–3.4 — in progress: title + "In progress", the live ring,
// the readout line, what it pays, Verify now, Stop quest.
import React from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { fonts, space, type as font } from '../../../ui/theme';
import type { ActiveView } from '../../quest-sheet';
import { ProgressRing } from './ProgressRing';
import { StatusPill, TextLink } from './SheetParts';

type Props = { view: ActiveView; notice: string | null; onVerify: () => void; onStop: () => void; onDemoMiss?: () => void };

export function QuestActive({ view, notice, onVerify, onStop, onDemoMiss }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
        <Text style={{ color: t.text, fontSize: font.title, fontFamily: fonts.medium, flexShrink: 1 }}>{view.title}</Text>
        <StatusPill label="In progress" />
      </View>
      <ProgressRing fraction={view.readout.fraction} big={view.readout.big} sub={view.readout.sub} />
      <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body, textAlign: 'center' }}>{view.readout.line}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
        <Icon name="umbrella" size={18} color={t.goldText} />
        <Text style={{ color: t.goldText, fontSize: font.body, fontFamily: fonts.medium }}>{view.pays}</Text>
      </View>
      {!!notice && <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body, textAlign: 'center' }}>{notice}</Text>}
      <Button primary title="Verify now" onPress={onVerify} />
      <TextLink title="Stop quest" onPress={onStop} />
      {onDemoMiss && <TextLink title="Demo: show “not quite yet”" onPress={onDemoMiss} />}
    </View>
  );
}
