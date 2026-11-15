// OWNER: B (task B8). Quest sheet 3.1 — the offer: what it pays, what we check, Start quest, and
// the other quests as chips.
import React from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../../ui/components';
import { radius, space, type as font } from '../../../ui/theme';
import type { TaskType } from '../../../contracts';
import { OFFER_FOOTER } from '../../quest-copy';
import type { OfferView } from '../../quest-sheet';
import { Hairline, QuestChip } from './SheetParts';

type Props = { view: OfferView; onStart: () => void; onPick: (type: TaskType) => void };

export function QuestOffer({ view, onStart, onPick }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        {/* DESIGN: quest type icon in a round gold-tint badge via src/ui/Icon when it ships */}
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.background }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.textMuted, fontSize: font.small }}>Quest</Text>
          <Text style={{ color: t.text, fontSize: font.title, fontWeight: '500' }}>{view.title}</Text>
        </View>
      </View>
      <View style={{ alignSelf: 'flex-start', backgroundColor: t.background, borderRadius: radius.pill, paddingHorizontal: space.m - 2, paddingVertical: space.s }}>
        {/* DESIGN: umbrella icon + goldText on the gold tint */}
        <Text style={{ color: t.umbrella, fontSize: font.body, fontWeight: '500' }}>{view.pays}</Text>
      </View>
      <Hairline />
      <Text style={{ color: t.textMuted, fontSize: font.small }}>What we check</Text>
      {view.checks.map((c) => (
        <Text key={c} style={{ color: t.text, fontSize: font.body }}>
          {c}
        </Text>
      ))}
      <Hairline />
      {view.blocked ? (
        <Text style={{ color: t.textMuted, fontSize: font.body }}>{view.blocked}</Text>
      ) : (
        // DESIGN: peach primary button (primaryBg / primaryText) when the tokens ship.
        <Button primary title="Start quest" onPress={onStart} />
      )}
      <Text style={{ color: t.textMuted, fontSize: font.small }}>Other quests</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s + 2 }}>
        {view.others.map((c) => (
          <QuestChip key={c.type} label={c.label} pays={c.pays} disabled={c.disabled} onPress={() => onPick(c.type)} />
        ))}
      </View>
      <Text style={{ color: t.textMuted, fontSize: font.small }}>{OFFER_FOOTER}</Text>
    </View>
  );
}
