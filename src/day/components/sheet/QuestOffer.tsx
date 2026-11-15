// OWNER: B (task B8). Quest sheet 3.1 — the offer: what it pays, what we check, Start quest, and
// the other quests as chips.
import React from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { IconDisc } from '../../../ui/primitives';
import { fonts, radius, space, type as font } from '../../../ui/theme';
import type { TaskType } from '../../../contracts';
import { OFFER_FOOTER } from '../../quest-copy';
import type { OfferView } from '../../quest-sheet';
import { TASK_ICON } from '../taskIcon';
import { Hairline, QuestChip } from './SheetParts';

type Props = { view: OfferView; onStart: () => void; onPick: (type: TaskType) => void };

export function QuestOffer({ view, onStart, onPick }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <IconDisc name={TASK_ICON[view.type]} size={48} bg={t.goldTint} color={t.goldText} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>Quest</Text>
          <Text style={{ color: t.text, fontSize: font.title, fontFamily: fonts.medium }}>{view.title}</Text>
        </View>
      </View>
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: t.goldTint, borderRadius: radius.pill, paddingHorizontal: space.m - 2, paddingVertical: space.s }}>
        <Icon name="umbrella" size={18} color={t.goldTintText} />
        <Text style={{ color: t.goldTintText, fontSize: font.body, fontFamily: fonts.medium }}>{view.pays}</Text>
      </View>
      <Hairline />
      <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>What we check</Text>
      {view.checks.map((c) => (
        <Text key={c} style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>
          {c}
        </Text>
      ))}
      <Hairline />
      {view.blocked ? (
        <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{view.blocked}</Text>
      ) : (
        <Button primary title="Start quest" onPress={onStart} />
      )}
      <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>Other quests</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s + 2 }}>
        {view.others.map((c) => (
          <QuestChip key={c.type} icon={TASK_ICON[c.type]} label={c.label} pays={c.pays} disabled={c.disabled} onPress={() => onPick(c.type)} />
        ))}
      </View>
      <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>{OFFER_FOOTER}</Text>
    </View>
  );
}
