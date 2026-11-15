// OWNER: B (task B7). Design 3.7 "Meetup — the code": the three-word code in big block capitals,
// three steps, "Open camera". Copy is the design's, verbatim.
import React from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../ui/components';
import { fonts, radius, space, type as font } from '../../ui/theme';
import type { MeetupCode } from '../wordlist';

export const formatCode = (code: MeetupCode) => code.join(' · ');

const STEPS = ['Write it on paper, big and clear.', 'Snap it here before you part ways.', "It's read on your phone. The photo isn't kept."];

export function MeetupCodeCard({ code, onOpenCamera }: { code: MeetupCode; onOpenCamera: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <View>
        <Text style={{ color: t.muted, fontSize: font.small }}>Quest</Text>
        <Text style={{ color: t.text, fontSize: font.title, fontFamily: fonts.medium }}>Meet someone</Text>
      </View>
      <Text style={{ color: t.muted, fontSize: font.body }}>Write this by hand while you're together:</Text>
      <View
        accessibilityLabel={`Code: ${code.join(', ')}`}
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: t.gold, borderRadius: radius.m, backgroundColor: t.goldTint, padding: space.l }}
      >
        <Text style={{ color: t.text, fontSize: 28, letterSpacing: 1, textAlign: 'center', fontFamily: fonts.displaySemi }}>{formatCode(code)}</Text>
      </View>
      {STEPS.map((step, i) => (
        <View key={step} style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start' }}>
          <View style={{ width: 26, height: 26, borderRadius: radius.pill, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.muted, fontSize: font.small }}>{i + 1}</Text>
          </View>
          <Text style={{ color: t.text, fontSize: font.body, flex: 1 }}>{step}</Text>
        </View>
      ))}
      <Button primary title="Open camera" onPress={onOpenCamera} />
    </View>
  );
}
