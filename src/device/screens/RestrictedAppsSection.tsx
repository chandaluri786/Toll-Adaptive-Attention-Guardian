// OWNER: A (Spec A, task A8). The "Distracting apps" section inside C's Settings container.
//   - Adding an app applies at once.
//   - Removing one takes 12 hours; the row shows the countdown and a "Keep" way back.
//   - Up to 2 messaging apps stay always-open.
// `RestrictedAppsSectionView` is pure presentation (the gallery renders it from plain data);
// the default export connects it to the app config and installed-app list.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import services, { device } from '../../services';
import { useTheme } from '../../ui/components';
import { Body, ChoiceRow, SectionLabel } from '../../ui/primitives';
import { space } from '../../ui/theme';
import { MIN } from '../../shared/emitter';
import { MAX_MESSAGING_APPS } from '../policy';
import type { InstalledApp } from '../ports';

/** "11 h 42 m", "42 m", or "under a minute". */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (total === 0) return 'under a minute';
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

export type RestrictedAppsViewProps = {
  apps: InstalledApp[];
  restricted: readonly string[];
  /** package -> time the removal takes effect */
  pending: Readonly<Record<string, number>>;
  alwaysOpen: readonly string[];
  now: number;
  onAdd: (pkg: string) => void;
  onRemove: (pkg: string) => void;
  onKeep: (pkg: string) => void;
  onToggleAlwaysOpen: (pkg: string) => void;
};

export function RestrictedAppsSectionView(p: RestrictedAppsViewProps) {
  const t = useTheme();
  const name = (pkg: string) => p.apps.find((a) => a.pkg === pkg)?.name ?? pkg;
  const notRestricted = p.apps.filter((a) => !p.restricted.includes(a.pkg));
  const action = (label: string) => <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: 14 }}>{label}</Text>;

  return (
    <View style={{ gap: space.s }}>
      <SectionLabel>Distracting apps</SectionLabel>
      {p.restricted.length === 0 && <Body muted>None yet. Add the apps that pull you in.</Body>}
      {p.restricted.map((pkg) => {
        const at = p.pending[pkg];
        return (
          <ChoiceRow
            key={pkg}
            title={name(pkg)}
            selected
            subtitle={at ? `Back to normal in ${formatRemaining(at - p.now)}` : undefined}
            onPress={at ? () => p.onKeep(pkg) : () => p.onRemove(pkg)}
            accessory={action(at ? 'Keep' : 'Remove')}
          />
        );
      })}
      <Body muted small>Adding is instant. Removing one takes 12 hours.</Body>

      <SectionLabel>Add an app</SectionLabel>
      {notRestricted.map((a) => (
        <ChoiceRow key={a.pkg} title={a.name} onPress={() => p.onAdd(a.pkg)} accessory={action('Add')} />
      ))}

      <SectionLabel>{`Always-open messaging  ${p.alwaysOpen.length} of ${MAX_MESSAGING_APPS}`}</SectionLabel>
      {notRestricted.map((a) => {
        const picked = p.alwaysOpen.includes(a.pkg);
        return (
          <ChoiceRow
            key={`m-${a.pkg}`}
            title={a.name}
            selected={picked}
            disabled={!picked && p.alwaysOpen.length >= MAX_MESSAGING_APPS}
            onPress={() => p.onToggleAlwaysOpen(a.pkg)}
          />
        );
      })}
    </View>
  );
}

export default function RestrictedAppsSection() {
  const kit = device.kit;
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    kit.installedApps.list().then((l) => alive && setApps(l));
    const unsub = kit.config.onChange(() => bump((n) => n + 1));
    // The 12-hour countdown ticks once a minute; settle() inside the config applies due removals.
    const timer = setInterval(() => bump((n) => n + 1), MIN);
    return () => {
      alive = false;
      unsub();
      clearInterval(timer);
    };
  }, [kit]);

  const pending = Object.fromEntries(kit.config.pendingRemovals().map((r) => [r.pkg, r.effectiveAt]));
  const alwaysOpen = kit.config.alwaysOpen();

  return (
    <RestrictedAppsSectionView
      apps={apps}
      restricted={kit.config.restricted()}
      pending={pending}
      alwaysOpen={alwaysOpen}
      now={services.clock.now()}
      onAdd={(pkg) => kit.config.addRestricted(pkg)}
      onRemove={(pkg) => kit.config.requestRemoval(pkg)}
      onKeep={(pkg) => kit.config.cancelRemoval(pkg)}
      onToggleAlwaysOpen={(pkg) =>
        kit.config.setAlwaysOpen(alwaysOpen.includes(pkg) ? alwaysOpen.filter((p) => p !== pkg) : [...alwaysOpen, pkg])
      }
    />
  );
}
