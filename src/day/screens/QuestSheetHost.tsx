// OWNER: B (Spec B — tasks B3, B8). Always mounted in src/app/_layout.tsx; opens when anyone calls
// Quests.openSheet() (Storm screen, Today). Offer (3.1) → in progress with a live readout (3.2–3.4)
// → pass (3.5) or not yet (3.6); a meetup hands over to B7's capture flow (3.7–3.9).
// State and copy live in ../quest-sheet.ts (pure, tested); this file only wires and renders.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import services, { day, debug } from '../../services';
import { useBalance } from '../../shared/hooks';
import { useTheme } from '../../ui/components';
import { radius, space, type as font } from '../../ui/theme';
import { QuestActive } from '../components/sheet/QuestActive';
import { QuestNotYet } from '../components/sheet/QuestNotYet';
import { QuestOffer } from '../components/sheet/QuestOffer';
import { QuestPassed } from '../components/sheet/QuestPassed';
import { sheetRequests } from '../fakes';
import { useNow } from '../hooks';
import { activeView, afterAccept, afterVerify, notYetView, offerView, onVerifiedPhase, openPhase, passView, pickOffer, type Phase, type SheetPort } from '../quest-sheet';
import { engineSheetPort, fakeSheetPort } from '../quest-sheet-port';
import { MeetupFlow } from './MeetupFlow';

const now = () => services.clock.now();

/** The real engine when the day module has one (USE_REAL), else the hour-0 fakes — same check as B7. */
function makePort(): SheetPort {
  const engine = day.engine?.();
  const store = day.plannerStore?.();
  if (engine && store) return engineSheetPort(engine, store, now);
  return fakeSheetPort({ now, accept: debug.day.accept, passActive: debug.day.passActive, quests: services.quests, ledger: services.ledger });
}

function useSheetPhase(port: SheetPort) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [, setRev] = useState(0);
  useEffect(() => sheetRequests.on((r) => setPhase(openPhase(port, { offer: r.offer }))), [port]);
  useEffect(
    () =>
      services.quests.onVerified((q, v, minted) => {
        const storm = services.postureSource.get().posture === 'sealed';
        setPhase((p) => (p ? onVerifiedPhase(p, q, v, minted, storm) : p));
      }),
    [],
  );
  // Live readout: re-render on engine changes (steps, locations, screen events).
  useEffect(() => day.engine?.().subscribe(() => setRev((x) => x + 1)), []);
  return [phase, setPhase] as const;
}

export default function QuestSheetHost() {
  const t = useTheme();
  const port = useMemo(makePort, []);
  const [phase, setPhase] = useSheetPhase(port);
  const balance = useBalance();
  const ticking = phase?.kind === 'active' || phase?.kind === 'notYet';
  const clockNow = useNow(1000, ticking);
  const meetupQuestId = phase?.kind === 'meetup' ? phase.quest.id : null;
  const meetup = useMemo(() => (meetupQuestId ? port.meetup(meetupQuestId) : null), [port, meetupQuestId]);
  const close = () => setPhase(null);

  const body = (() => {
    if (!phase) return null;
    switch (phase.kind) {
      case 'offer':
        return <QuestOffer view={offerView(port, phase)} onStart={() => setPhase(afterAccept(phase, port.accept(phase.type, phase.taskId)))} onPick={(type) => setPhase(pickOffer(type))} />;
      case 'active': {
        const id = phase.quest.id;
        return (
          <QuestActive
            view={activeView(port, phase.quest, port.progress(id))}
            notice={phase.notice}
            onVerify={() => setPhase(afterVerify(phase, port.verify(id)))}
            onStop={() => {
              port.abandon(id);
              close();
            }}
            onDemoMiss={port.simulateMiss ? () => setPhase(afterVerify(phase, port.simulateMiss!(id))) : undefined}
          />
        );
      }
      case 'notYet': {
        const id = phase.quest.id;
        const view = notYetView(port, phase, port.progress(id), clockNow);
        return <QuestNotYet view={view} onRetry={() => setPhase(afterVerify(phase, port.verify(id)))} onClaimHalf={() => setPhase(afterVerify(phase, port.claimHalf(id), true))} />;
      }
      case 'meetup':
        if (!meetup) return <Text style={{ color: t.text, fontSize: font.body }}>This meetup has ended.</Text>;
        return <MeetupFlow code={meetup.code} questStartedAt={meetup.startedAt} now={now} submit={meetup.submit} practice={meetup.practice} onClose={close} />;
      case 'passed':
        return <QuestPassed view={passView(phase, balance)} onDone={close} />;
    }
  })();

  return (
    <Modal visible={!!phase} transparent animationType="slide" onRequestClose={close}>
      {/* The sheet sits over whatever opened it (Today or the Storm screen); tap above it to close. */}
      <Pressable accessibilityLabel="Close quest sheet" style={{ flex: 1 }} onPress={close} />
      <ScrollView
        style={{ flexGrow: 0, maxHeight: '88%', backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l }}
        contentContainerStyle={{ padding: space.l - 2, paddingTop: space.s + 2, gap: space.m }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.divider }} />
        {body}
      </ScrollView>
    </Modal>
  );
}
