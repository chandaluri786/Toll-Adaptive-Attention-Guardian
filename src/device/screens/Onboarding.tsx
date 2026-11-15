// OWNER: A (Spec A, tasks A7, A8). The connected onboarding: holds the step and the picks, polls the
// permission status, and saves everything when the user finishes. Drawing lives in OnboardingView.tsx.
//
// Permission polling: usage access and "display over other apps" send the user to a system settings
// page with no callback. So we re-check when the app returns to the foreground, and every 2 s while the
// permissions step is showing, and tick the dot when it flips.
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SetHomeStep from '../../day/components/SetHomeStep';
import { device } from '../../services';
import { SUGGESTED_RESTRICTED, MAX_MESSAGING_APPS } from '../policy';
import type { InstalledApp, PermissionId, PermissionStatus } from '../ports';
import { OnboardingView, type OnboardingStep } from './OnboardingView';

const NONE: PermissionStatus = { usage: false, overlay: false, notifications: false, location: false, camera: false, motion: false };

export default function Onboarding() {
  const kit = device.kit;
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [permissions, setPermissions] = useState<PermissionStatus>(NONE);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [restricted, setRestricted] = useState<Set<string>>(new Set());
  const [alwaysOpen, setAlwaysOpen] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => kit.permissions.status().then(setPermissions).catch(() => undefined), [kit]);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    if (step !== 1) return;
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [step, refresh]);

  // Load the installed apps once and pre-pick the usual suspects.
  useEffect(() => {
    let alive = true;
    kit.installedApps.list().then((list) => {
      if (!alive) return;
      setApps(list);
      setRestricted(new Set(list.filter((a) => SUGGESTED_RESTRICTED.includes(a.pkg)).map((a) => a.pkg)));
    });
    return () => {
      alive = false;
    };
  }, [kit]);

  const toggleRestricted = (pkg: string) => {
    setRestricted((prev) => {
      const next = new Set(prev);
      next.has(pkg) ? next.delete(pkg) : next.add(pkg);
      return next;
    });
    setAlwaysOpen((prev) => {
      const next = new Set(prev);
      next.delete(pkg); // an app is never both
      return next;
    });
  };
  const toggleAlwaysOpen = (pkg: string) =>
    setAlwaysOpen((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else if (next.size < MAX_MESSAGING_APPS) next.add(pkg);
      return next;
    });

  const finish = () => {
    restricted.forEach((pkg) => kit.config.addRestricted(pkg));
    kit.config.setAlwaysOpen([...alwaysOpen]);
    kit.onboarding.markDone();
    void kit.refreshPermissions();
    router.replace('/');
  };

  const sleepLabel = useMemo(() => '23:00–07:00', []); // B's planner owns the real value (B1)

  return (
    <OnboardingView
      step={step}
      permissions={permissions}
      onRequestPermission={(id: PermissionId) => void kit.permissions.request(id).then(refresh)}
      homeSlot={<SetHomeStep />}
      apps={apps}
      restricted={restricted}
      alwaysOpen={alwaysOpen}
      onToggleRestricted={toggleRestricted}
      onToggleAlwaysOpen={toggleAlwaysOpen}
      sleepLabel={sleepLabel}
      topInset={insets.top}
      onNext={() => (step === 3 ? finish() : setStep((s) => (s + 1) as OnboardingStep))}
      onBack={() => setStep((s) => Math.max(0, s - 1) as OnboardingStep)}
    />
  );
}
