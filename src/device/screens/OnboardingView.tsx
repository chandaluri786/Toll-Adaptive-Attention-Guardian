// OWNER: A (Spec A, task A7). Onboarding, presentation only. Matches the approved design (docs/DESIGN.md,
// screens 6.1 to 6.4). Four steps, one primary button each:
//   0 Meet the weather (sky and the mascot)  ·  1 Permissions  ·  2 Where's home? (B's SetHomeStep)
//   3 What pulls you in? (app tiles, always-open messaging, sleep)
// Rules: one idea per screen; permissions show live status and NEVER block progress (a refused permission
// degrades one feature, it does not stop setup).
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WeatherChip, useTheme } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Mascot } from '../../ui/Mascot';
import { Body, Card, Display } from '../../ui/primitives';
import { SkyScene } from '../../ui/SkyScene';
import { fonts, radius, tileColor } from '../../ui/theme';
import { MAX_MESSAGING_APPS } from '../policy';
import { PERMISSIONS, type InstalledApp, type PermissionId, type PermissionStatus } from '../ports';

export type OnboardingStep = 0 | 1 | 2 | 3;

export type OnboardingViewProps = {
  step: OnboardingStep;
  permissions: PermissionStatus;
  onRequestPermission: (id: PermissionId) => void;
  /** Step 2 is B's component, passed in so this view stays free of the other owners' code. */
  homeSlot: React.ReactNode;
  apps: InstalledApp[];
  restricted: ReadonlySet<string>;
  alwaysOpen: ReadonlySet<string>;
  onToggleRestricted: (pkg: string) => void;
  onToggleAlwaysOpen: (pkg: string) => void;
  sleepLabel: string;
  topInset?: number;
  onNext: () => void;
  onBack: () => void;
};

const BUTTON = ['Sounds good', 'Continue', 'Set home', 'Start'] as const;

const WEATHER_LINES = [
  { posture: 'open', text: 'Everything is free' },
  { posture: 'metered', text: 'Apps cost umbrella time' },
  { posture: 'sealed', text: 'Fresh quest time only' },
] as const;

export function OnboardingView(p: OnboardingViewProps) {
  const t = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {p.step === 0 ? <MeetTheWeather step={p.step} /> : <Header step={p.step} topInset={p.topInset} />}
        {p.step === 1 && <Permissions status={p.permissions} onRequest={p.onRequestPermission} />}
        {p.step === 2 && (
          <View style={styles.body}>
            <Display>Where's home?</Display>
            <Body muted>Only used for "away from home" quests. It stays on your phone.</Body>
            {p.homeSlot}
          </View>
        )}
        {p.step === 3 && <Apps {...p} />}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={p.onNext} style={[styles.primary, { backgroundColor: t.primaryBg, borderColor: t.gold }]}>
          <Text style={{ color: t.primaryText, fontSize: 17, fontFamily: fonts.medium }}>{BUTTON[p.step]}</Text>
        </Pressable>
        {p.step > 1 && (
          <Text accessibilityRole="link" onPress={p.onBack} style={{ color: t.muted, fontSize: 15, fontFamily: fonts.body, textAlign: 'center', paddingVertical: 12 }}>
            Back
          </Text>
        )}
      </View>
    </View>
  );
}

/** Four little bars, the first `step + 1` filled in gold. */
function Progress({ step }: { step: OnboardingStep }) {
  const t = useTheme();
  return (
    <View style={styles.progress} accessible accessibilityLabel={`Step ${step + 1} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? t.gold : t.track }} />
      ))}
    </View>
  );
}

function Header({ step, topInset = 0 }: { step: OnboardingStep; topInset?: number }) {
  return (
    <View style={{ paddingTop: topInset + 14, paddingHorizontal: 22 }}>
      <Progress step={step} />
    </View>
  );
}

/** Step 1: the sky, the mascot, and what the three weathers mean. */
function MeetTheWeather({ step }: { step: OnboardingStep }) {
  return (
    <View>
      <View style={{ height: 250 }}>
        <SkyScene posture="open" quiet />
        <View style={styles.mascot}>
          <Mascot variant="cloud" mood="happy" size={104} />
        </View>
      </View>
      <View style={[styles.body, { paddingTop: 14 }]}>
        <Progress step={step} />
        <Display>Your phone has weather now.</Display>
        <Body muted>
          Toll sets the sky through your day. When it clouds over, distracting apps cost umbrella time, and you earn it by getting real
          things done.
        </Body>
        <View style={{ gap: 12, marginTop: 6 }}>
          {WEATHER_LINES.map((l) => (
            <View key={l.posture} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 104 }}>
                <WeatherChip posture={l.posture} variant="solid" />
              </View>
              <Body>{l.text}</Body>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Permissions({ status, onRequest }: { status: PermissionStatus; onRequest: (id: PermissionId) => void }) {
  const t = useTheme();
  return (
    <View style={styles.body}>
      <Display>A few permissions</Display>
      <Body muted>Each one unlocks something. Skip any — Toll still works.</Body>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {PERMISSIONS.map((perm, i) => {
          const on = status[perm.id];
          return (
            <View key={perm.id} style={[styles.permRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.divider }]}>
              <View style={[styles.permDot, { backgroundColor: on ? t.good : 'transparent', borderColor: on ? t.good : t.faint }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 17, fontFamily: fonts.medium }}>{perm.name}</Text>
                <Text style={{ color: t.muted, fontSize: 14, lineHeight: 19, fontFamily: fonts.body }}>{perm.why}</Text>
              </View>
              {on ? (
                <Text style={{ color: t.good, fontSize: 14, fontFamily: fonts.medium }}>On</Text>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Allow ${perm.name}`} onPress={() => onRequest(perm.id)} style={[styles.allow, { borderColor: t.gold }]}>
                  <Text style={{ color: t.goldText, fontSize: 14, fontFamily: fonts.medium }}>Allow</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function AppTile({ app, selected, onPress }: { app: InstalledApp; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={app.name} onPress={onPress} style={styles.tileWrap}>
      <View style={[styles.tile, { backgroundColor: tileColor(app.name), borderColor: selected ? t.gold : 'transparent' }]}>
        <Text style={{ color: '#2a2433', fontSize: 22, fontFamily: fonts.bold }}>{app.name.charAt(0).toUpperCase()}</Text>
        {selected && (
          <View style={[styles.badge, { backgroundColor: t.gold }]}>
            <Icon name="check" size={11} color="#ffffff" strokeWidth={3.5} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12, fontFamily: fonts.body }}>{app.name}</Text>
    </Pressable>
  );
}

function Apps(p: OnboardingViewProps) {
  const t = useTheme();
  const messaging = p.apps.filter((a) => !p.restricted.has(a.pkg));
  return (
    <View style={styles.body}>
      <Display>What pulls you in?</Display>
      <Body muted>These get weather. We picked a few from your usage. Tap to change.</Body>
      <View style={styles.grid}>
        {p.apps.map((a) => (
          <AppTile key={a.pkg} app={a} selected={p.restricted.has(a.pkg)} onPress={() => p.onToggleRestricted(a.pkg)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="info" size={16} color={t.muted} />
        <Text style={{ flex: 1, color: t.muted, fontSize: 14, fontFamily: fonts.body }}>Adding is instant. Removing one takes 12 hours.</Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
        <Text style={{ color: t.text, fontSize: 17, fontFamily: fonts.medium }}>Always-open messaging</Text>
        <Text style={{ color: t.muted, fontSize: 14, fontFamily: fonts.body }}>{`${p.alwaysOpen.size} of ${MAX_MESSAGING_APPS}`}</Text>
      </View>
      <View style={styles.chips}>
        {messaging.map((a) => {
          const picked = p.alwaysOpen.has(a.pkg);
          const full = p.alwaysOpen.size >= MAX_MESSAGING_APPS;
          return (
            <Pressable
              key={a.pkg}
              accessibilityRole="button"
              accessibilityState={{ selected: picked, disabled: !picked && full }}
              disabled={!picked && full}
              onPress={() => p.onToggleAlwaysOpen(a.pkg)}
              style={[styles.chip, { borderColor: picked ? t.gold : t.divider, backgroundColor: picked ? t.goldTint : t.card, opacity: !picked && full ? 0.5 : 1 }]}
            >
              <Text style={{ color: picked ? t.goldTintText : t.text, fontSize: 15, fontFamily: fonts.medium }}>{a.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Body muted small>Calls, SMS, maps, banking, health, camera, clock and settings are always open too.</Body>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="moon" size={20} color={t.muted} />
        <Text style={{ flex: 1, color: t.text, fontSize: 16, fontFamily: fonts.body }}>{`Sleep ${p.sleepLabel}`}</Text>
        <Text style={{ color: t.goldText, fontSize: 15, fontFamily: fonts.medium }}>Change</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: 12 },
  body: { paddingHorizontal: 22, paddingTop: 22, gap: 14 },
  progress: { flexDirection: 'row', gap: 6 },
  mascot: { position: 'absolute', left: 160, top: 128 },
  footer: { paddingHorizontal: 22, paddingBottom: 18, paddingTop: 8 },
  primary: { minHeight: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9, paddingHorizontal: 6, minHeight: 56 },
  permDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  allow: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  tileWrap: { width: '25%', alignItems: 'center', gap: 6 },
  tile: { width: 64, height: 64, borderRadius: radius.l - 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
