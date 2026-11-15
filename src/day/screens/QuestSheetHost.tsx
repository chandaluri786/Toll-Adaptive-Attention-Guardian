// OWNER: B (Spec B — tasks B3, B8). Always mounted in src/app/_layout.tsx; opens when anyone calls
// Quests.openSheet(). Offer → in progress (live readout) → result. Never red, never "failed".
// B7: an active meetup quest shows the meetup capture flow (code → camera → check).
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import services, { day, debug } from '../../services';
import { sheetRequests, type SheetRequest } from '../fakes';
import { fromVerifyResult, practiceSubmitter, type CaptureVerdict } from '../meetup-capture';
import { generateMeetupCode, type MeetupCode } from '../wordlist';
import { Button, useTheme } from '../../ui/components';
import { space } from '../../ui/theme';
import { MeetupFlow } from './MeetupFlow';

type MeetupContext = { code: MeetupCode; startedAt: number; submit: (text: string) => CaptureVerdict; practice: boolean };

/** The live meetup quest from the real engine, if there is one (the fake day module has none). */
function activeMeetup(): MeetupContext | null {
  const engine = day.engine?.();
  const quest = engine?.active().find((q) => q.type === 'meetup');
  const code = quest && engine?.progress(quest.id)?.code;
  if (!engine || !quest || !code) return null;
  return { code, startedAt: quest.acceptedAt, submit: (text) => fromVerifyResult(engine.submitMeetupPhoto(quest.id, text)), practice: false };
}

/** Hour-6 handwriting check while the fake day module is live: a local code, no minutes. */
function practiceMeetup(): MeetupContext {
  const code = generateMeetupCode();
  return { code, startedAt: services.clock.now(), submit: practiceSubmitter(code), practice: true };
}

export default function QuestSheetHost() {
  const t = useTheme();
  const [req, setReq] = useState<SheetRequest | null>(null);
  const [result, setResult] = useState('');
  const [meetup, setMeetup] = useState<MeetupContext | null>(null);
  useEffect(() => sheetRequests.on((r) => {
    setReq(r);
    setResult('');
    setMeetup(activeMeetup());
  }), []);
  const close = () => {
    setReq(null);
    setMeetup(null);
  };

  return (
    <Modal visible={!!req} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <ScrollView
          style={{ flexGrow: 0, backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
          contentContainerStyle={{ padding: space.l, gap: space.m }}
        >
          {meetup ? (
            <MeetupFlow
              code={meetup.code}
              questStartedAt={meetup.startedAt}
              now={() => services.clock.now()}
              submit={meetup.submit}
              practice={meetup.practice}
              onClose={close}
            />
          ) : (
            <>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Quest · Walk 2,000 steps</Text>
              <Text style={{ color: t.textMuted }}>Placeholder sheet (B8) · opened from {req?.from}</Text>
              {!!result && <Text style={{ color: t.text }}>{result}</Text>}
              <Button
                primary
                title="Pass (fake)"
                onPress={() => {
                  debug.day.passActive();
                  setResult(req?.posture === 'sealed' ? 'Passed — umbrella up straight away.' : 'Passed — 25 minutes dropped into your umbrella.');
                }}
              />
              <Button title="Not quite yet (fake miss)" onPress={() => setResult("You're 200 m from home — need 500 m. Try again in 5 min.")} />
              <Button title="Meetup code (OCR check)" onPress={() => setMeetup(practiceMeetup())} />
              <Button title="Close" onPress={close} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
