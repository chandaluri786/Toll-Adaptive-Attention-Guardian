// OWNER: A (Spec A, tasks A5, A6). The connected Storm / Cloud screen: reads the services, hands a view
// model to <StormView/>, and turns taps into calls on the contract. All decisions live in
// stormViewModel.ts; all pixels live in StormView.tsx; this file is only glue.
//
// How a user gets here: expo-app-blocker brings the app to the front with the deep link
//   toll://blocked?app=<Name>&package=<pkg>&reason=opened|expired
// and expo-router sends that to src/app/blocked.tsx, which renders this.
//
// The three choices (planning doc, "How blocks lift"; copy from the approved design):
//   Wait 60 seconds   grants nothing; the sky settles, then "That's a minute".
//   Open umbrella     spends umbrella time (Cloudy only; refused by the ledger in a Storm).
//   Take a quest      opens B's quest sheet; a pass in a Storm opens the app straight away.
// plus the emergency unlock (once a day, two taps and a confirm).
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import services, { device } from '../../services';
import { useBalance, usePosture } from '../../shared/hooks';
import { fmtClock } from '../notifications';
import { classify, isAllowed } from '../policy';
import {
  SPEND_MINUTES,
  WAIT_SECONDS,
  nextEmergencyStep,
  openedViewModel,
  stormViewModel,
  type Door,
  type EmergencyStep,
} from '../stormViewModel';
import { StormView } from './StormView';

export default function StormScreen({ appName, pkg, reason }: { appName?: string; pkg?: string; reason?: string }) {
  const state = usePosture();
  const balance = useBalance();
  const insets = useSafeAreaInsets();
  const [waitLeft, setWaitLeft] = useState<number | null>(null);
  const [step, setStep] = useState<EmergencyStep>('idle');
  const [opened, setOpened] = useState<ReturnType<typeof openedViewModel> | null>(null);

  // Leave the screen. Reached from the blocker: go back to the app the user was in (finishing our
  // activity reveals it). Reached inside Toll: just navigate back.
  const leave = useCallback(() => {
    if (reason && Platform.OS === 'android') BackHandler.exitApp();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [reason]);

  // The policy decision for THIS app (a discretionary app in a Storm can be bought with umbrella time).
  const decision = useMemo(() => {
    if (!pkg) return undefined;
    const d = isAllowed(classify(pkg, device.kit.config.classification()), state.posture, [], services.clock.now());
    return d.kind === 'intercept' ? d : undefined;
  }, [pkg, state.posture]);

  // When today's emergency unlock was used, from the ledger's daily summary (through the contract).
  const usedAt = (() => {
    const today = services.ledger.history(1).at(-1);
    const at = today?.emergencyUnlocks.at(-1);
    return at ? fmtClock(at) : null;
  })();

  const vm = stormViewModel({
    posture: state.posture,
    reason: state.reason,
    grace: state.grace,
    graceLeft: state.grace && state.nextChange ? Math.max(0, Math.round((state.nextChange.at - services.clock.now()) / 1000)) : undefined,
    appName: appName ?? null,
    trigger: reason === 'expired' ? 'expired' : 'opened',
    balance,
    emergencyLeft: services.governor.emergencyLeftToday(),
    clearsAt: state.nextChange ? fmtClock(state.nextChange.at) : null,
    waitLeft,
    emergencyUsedAt: usedAt,
    decision,
  });

  // "Wait 60 seconds": counts down from a start time, refreshed every 250 ms like the design, so the progress
  // fill and the Storm's calming are smooth. It stops at 0 ("That's a minute") and the user chooses.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);
  const startWait = () => {
    if (waitLeft !== null && waitLeft > 0) return; // already counting
    setWaitLeft(WAIT_SECONDS);
    if (timer.current) clearInterval(timer.current);
    const started = Date.now(); // real time on purpose: the wait is a human pause, not the demo clock
    timer.current = setInterval(() => {
      const left = Math.max(0, WAIT_SECONDS - (Date.now() - started) / 1000);
      if (left <= 0 && timer.current) clearInterval(timer.current);
      setWaitLeft(left);
    }, 250);
  };

  // A quest passing in a Storm opens a window: show that it is open, then let the user go back.
  useEffect(
    () =>
      services.ledger.onChange(() => {
        const now = services.clock.now();
        if (services.ledger.activeWindows().some((w) => w.until > now && w.source === 'quest')) leave();
      }),
    [leave],
  );

  const spend = () => {
    const cost = Math.ceil(SPEND_MINUTES / (decision?.spendRate ?? 1));
    const result = services.ledger.spend(cost, 'restricted');
    if (result.ok) setOpened(openedViewModel({ kind: 'umbrella', appName: appName ?? null, balanceAfter: services.ledger.balance() }));
  };

  const onDoor = (key: Door['key']) => {
    if (key === 'wait') startWait();
    else if (key === 'umbrella') spend();
    else services.quests.openSheet({ from: 'storm_screen', posture: state.posture, pkg });
  };

  const onEmergency = (action: 'tap' | 'confirm' | 'cancel') => {
    const next = nextEmergencyStep(step, action);
    setStep(next);
    if (next === 'done' && step !== 'done') {
      // Only the final confirm calls the governor; the window then opens every app for 15 minutes.
      const w = services.governor.emergencyUnlock();
      if (w) setOpened(openedViewModel({ kind: 'emergency', appName: appName ?? null, pickUpAt: fmtClock(w.until) }));
    }
  };

  return (
    <StormView
      vm={vm}
      posture={state.posture}
      emergencyStep={step}
      opened={opened}
      topInset={insets.top}
      onDoor={onDoor}
      onEmergency={onEmergency}
      onOpenApp={leave}
      onDismiss={leave}
    />
  );
}
