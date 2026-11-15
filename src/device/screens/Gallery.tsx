// OWNER: A (Spec A). The state gallery: every screen and state A builds, on one page, in light and dark,
// laid out like the approved design's own gallery (numbered sections, phone frames). Open it in a browser
// (no phone needed): `npm run web`, then go to /gallery. Everything shown is produced by the real logic
// fed with sample data (see galleryData.ts), so what you see is what the code does.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemeModeProvider, useTheme } from '../../ui/components';
import type { IconName } from '../../ui/Icon';
import { Mascot, type MascotMood, type MascotVariant } from '../../ui/Mascot';
import { Body, Card, Display, IconDisc, Segmented } from '../../ui/primitives';
import { SkyScene } from '../../ui/SkyScene';
import { BASE, fonts, space, type ThemeMode } from '../../ui/theme';
import { FAKE_APPS } from '../fakePorts';
import { type Range } from '../forecast';
import {
  GALLERY_NOW,
  GALLERY_PENDING,
  GALLERY_PERMISSIONS,
  GALLERY_RESTRICTED,
  STORM_SAMPLES,
  enforcementRows,
  forecastEmpty,
  forecastSample,
  persistentSample,
  sampleNotices,
} from '../galleryData';
import { fmtClock } from '../notifications';
import type { Notice, NoticeKind } from '../ports';
import { ForecastView } from './ForecastView';
import { OnboardingView, type OnboardingStep } from './OnboardingView';
import { RestrictedAppsSectionView } from './RestrictedAppsSection';
import { StormView } from './StormView';

type ThemeChoice = ThemeMode | 'both';
const noop = () => undefined;
const STATUS_BAR = 34;

const ThemeChoiceContext = React.createContext<ThemeChoice>('both');

/** Renders its children once per selected theme, each inside its own phone frame. */
function Phone({ id, label, height = 780, status = true, lightStatus = false, children }: { id: string; label: string; height?: number; status?: boolean; /** White status text, for screens drawn over a dark sky. */ lightStatus?: boolean; children: React.ReactNode }) {
  const choice = React.useContext(ThemeChoiceContext);
  const modes: ThemeMode[] = choice === 'both' ? ['light', 'dark'] : [choice];
  return (
    <>
      {modes.map((mode) => (
        <View key={mode} style={styles.phoneWrap}>
          <Text style={styles.caption}>{`${label} · ${mode === 'dark' ? 'starry night' : 'light'}`}</Text>
          <View testID={`frame-${id}-${mode}`} style={[styles.bezel, { height: height + 18 }]}>
            <View style={[styles.screen, { backgroundColor: BASE[mode].bg }]}>
              <ThemeModeProvider value={mode}>{children}</ThemeModeProvider>
              {status && <StatusBar mode={mode} light={lightStatus} />}
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

/** A minimal status bar so the screens sit where they would on a phone. */
function StatusBar({ mode, light }: { mode: ThemeMode; light: boolean }) {
  return (
    <View pointerEvents="none" style={styles.statusBar}>
      <Text style={{ color: light || mode === 'dark' ? '#f2f4ff' : '#1d2130', fontSize: 14, fontFamily: fonts.medium }}>10:14</Text>
    </View>
  );
}

function Section({ n, title, note, children }: { n: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.m }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <Text style={styles.sectionNo}>{n}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Text style={styles.sectionNote}>{note}</Text>
      </View>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

// ---- section 0: weather and mascot -----------------------------------------------------------------

const MOODS: { mood: MascotMood; label: string }[] = [
  { mood: 'happy', label: 'Clear skies' },
  { mood: 'calm', label: 'Clouds' },
  { mood: 'celebrate', label: 'Earned time' },
  { mood: 'sleepy', label: 'Night / empty' },
  { mood: 'peek', label: 'Peek' },
];

function MascotRow({ variant, title }: { variant: MascotVariant; title: string }) {
  const choice = React.useContext(ThemeChoiceContext);
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.subTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {MOODS.map(({ mood, label }) => {
          const dark = mood === 'sleepy' || choice === 'dark';
          const bg = dark ? '#14172a' : '#faf8f3';
          return (
            <View key={mood} testID={`mascot-${variant}-${mood}`} style={[styles.mascotCell, { backgroundColor: bg }]}>
              <ThemeModeProvider value={dark ? 'dark' : 'light'}>
                <Mascot variant={variant} mood={mood} size={60} dark={dark} />
              </ThemeModeProvider>
              <Text style={{ color: dark ? '#c6cde9' : '#565b6c', fontSize: 12, fontFamily: fonts.body }}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---- section 8: the notification shade --------------------------------------------------------------

const NOTICE_LOOK: Record<NoticeKind, { icon: IconName; tone: 'open' | 'metered' | 'sealed' | 'gold' }> = {
  plan_morning: { icon: 'sun', tone: 'open' },
  plan_noon: { icon: 'sun', tone: 'open' },
  block_soon: { icon: 'cloud-lightning', tone: 'sealed' },
  weather_change: { icon: 'cloud', tone: 'metered' },
  free_time_used: { icon: 'cloud', tone: 'metered' },
  umbrella_low: { icon: 'umbrella', tone: 'gold' },
  quest_verified: { icon: 'footprints', tone: 'gold' },
};

function useNoticeColors(tone: 'open' | 'metered' | 'sealed' | 'gold') {
  const t = useTheme();
  const dark = t.bg === BASE.dark.bg;
  return {
    open: [dark ? 'rgba(255,214,102,.16)' : '#fdf0c8', dark ? '#ffe3a3' : '#4a3a10'],
    metered: [dark ? 'rgba(200,198,220,.16)' : '#e3e1ef', t.text],
    sealed: [dark ? 'rgba(169,154,240,.22)' : '#3a2f80', dark ? '#e3ddff' : '#ffffff'],
    gold: [t.goldTint, t.goldTintText],
  }[tone];
}

function NoticeCard({ icon, tone, when, title, body, actions, bar }: { icon: IconName; tone: 'open' | 'metered' | 'sealed' | 'gold'; when: string; title: string; body: string; actions?: string[]; bar?: boolean }) {
  const t = useTheme();
  const [bg, fg] = useNoticeColors(tone);
  return (
    <View style={[styles.notice, { backgroundColor: t.card, borderColor: t.divider }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconDisc name={icon} size={24} bg={bg} color={fg} />
        <Text style={{ color: t.muted, fontSize: 13, fontFamily: fonts.body }}>{`Toll · ${when}`}</Text>
      </View>
      <Text style={{ color: t.text, fontSize: 16, lineHeight: 21, fontFamily: fonts.medium }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21, fontFamily: fonts.body }}>{body}</Text>
      {bar && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.track, overflow: 'hidden' }}>
          <View style={{ width: '30%', height: '100%', backgroundColor: t.gold }} />
        </View>
      )}
      {!!actions?.length && (
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 2 }}>
          {actions.map((a) => (
            <Text key={a} style={{ color: t.goldText, fontSize: 15, fontFamily: fonts.medium }}>{a}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function NotificationShade({ notices }: { notices: Notice[] }) {
  const t = useTheme();
  const dark = t.bg === BASE.dark.bg;
  return (
    <ScrollView style={{ backgroundColor: dark ? '#090b16' : '#e8e6ef' }} contentContainerStyle={{ padding: space.m, paddingTop: STATUS_BAR + 6, gap: 10 }}>
      <Text style={{ color: t.text, fontSize: 15, fontFamily: fonts.medium }}>Sat 14 Nov</Text>
      <Text style={styles.shadeLabel}>Ongoing</Text>
      <NoticeCard icon="cloud" tone="metered" when="now" title={persistentSample.title} body={persistentSample.body} />
      <Text style={styles.shadeLabel}>Notifications</Text>
      {[...notices].reverse().map((n, i) => (
        <NoticeCard
          key={i}
          icon={NOTICE_LOOK[n.kind].icon}
          tone={NOTICE_LOOK[n.kind].tone}
          when={i === 0 ? 'now' : fmtClock(n.at)}
          title={n.title}
          body={n.body}
          actions={n.actions}
          bar={n.kind === 'umbrella_low'}
        />
      ))}
    </ScrollView>
  );
}

export default function Gallery() {
  const [choice, setChoice] = useState<ThemeChoice>('both');
  const [range, setRange] = useState<Range>('week');
  const notices = React.useMemo(sampleNotices, []);
  const rows = React.useMemo(enforcementRows, []);

  return (
    <ThemeChoiceContext.Provider value={choice}>
      <ScrollView style={{ backgroundColor: '#f2f2f2' }} contentContainerStyle={styles.page}>
        <View style={{ gap: 10 }}>
          <Text style={styles.eyebrow}>TOLL · STATE GALLERY · SPEC A</Text>
          <Text style={styles.pageTitle}>Your phone has weather.</Text>
          <Text style={styles.sectionNote}>
            Every screen and state Person A builds, in light and dark, drawn from the real logic with sample data: no phone and no native code.
            Matches the approved design (see docs/DESIGN.md).
          </Text>
          <View style={{ width: 300 }}>
            <Segmented options={[{ id: 'both', label: 'Both' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] as const} value={choice} onChange={setChoice} />
          </View>
        </View>

        <Section n={0} title="Weather and mascot" note="The animated sky for each weather, and the mascot's five moods (task A12). Reduce-motion freezes the animation.">
          {(['open', 'metered', 'sealed'] as const).map((p) => (
            <SkyTile key={p} posture={p} />
          ))}
          <View style={{ width: '100%', gap: 24, marginTop: 12 }}>
            <MascotRow variant="cloud" title="A little cloud" />
            <MascotRow variant="sun" title="A tiny sun" />
          </View>
        </Section>

        <Section n={1} title="Storm / Cloud screen" note="Task A6. Shown over a distracting app: weather and reason first, umbrella time second, choices third. Emergency unlock is a plain link: tap it, tap Unlock, confirm.">
          {STORM_SAMPLES.map((s) => (
            <Phone key={s.id} id={`storm-${s.id}`} label={s.label} status={s.vm.mode !== 'grace'} lightStatus={s.posture === 'sealed' && !s.opened}>
              {s.vm.mode === 'grace' ? (
                <StripedApp>
                  <StormView vm={s.vm} posture={s.posture} emergencyStep="idle" opened={null} topInset={STATUS_BAR} onDoor={noop} onEmergency={noop} onOpenApp={noop} onDismiss={noop} />
                </StripedApp>
              ) : (
                <StormView vm={s.vm} posture={s.posture} emergencyStep={s.emergencyStep} opened={s.opened} topInset={STATUS_BAR} onDoor={noop} onEmergency={noop} onOpenApp={noop} onDismiss={noop} />
              )}
            </Phone>
          ))}
        </Section>

        <Section n={5} title="Forecast" note="Tasks A11 (week) and A13 (month, 6 months). Built from Ledger.history(); a new user sees the sleepy mascot.">
          <View style={{ width: '100%', maxWidth: 420 }}>
            <Segmented options={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'six_months', label: '6 months' }] as const} value={range} onChange={setRange} />
          </View>
          <View style={{ width: '100%' }} />
          <Phone id={`forecast-${range}`} label={`5.1 Forecast · ${range === 'six_months' ? '6 months' : range}`} height={1500}>
            <ForecastView model={forecastSample(range)} range={range} onRange={setRange} topInset={STATUS_BAR} />
          </Phone>
          <Phone id="forecast-empty" label="5.4 First days: empty" height={780}>
            <ForecastView model={forecastEmpty()} range="week" onRange={noop} topInset={STATUS_BAR} />
          </Phone>
        </Section>

        <Section n={6} title="Onboarding" note="Task A7. Four steps; permissions never block progress; up to 2 always-open messaging apps.">
          {([0, 1, 2, 3] as OnboardingStep[]).map((step) => (
            <Phone key={step} id={`onboarding-${step}`} label={['6.1 Meet the weather', '6.2 Permissions', "6.3 Set home (B's step)", '6.4 Apps and sleep'][step]} height={step === 3 ? 1380 : 780} status={step !== 0}>
              <OnboardingView
                step={step}
                permissions={GALLERY_PERMISSIONS}
                onRequestPermission={noop}
                homeSlot={<Card><Body muted>{"(B's map and \"Use my current location\" render here: task B1)"}</Body></Card>}
                apps={FAKE_APPS.slice(0, 8)}
                restricted={new Set(GALLERY_RESTRICTED)}
                alwaysOpen={new Set(['com.whatsapp', 'org.telegram.messenger'])}
                onToggleRestricted={noop}
                onToggleAlwaysOpen={noop}
                sleepLabel={'23:00–07:00'}
                topInset={STATUS_BAR}
                onNext={noop}
                onBack={noop}
              />
            </Phone>
          ))}
        </Section>

        <Section n={7} title="Settings: distracting apps" note="Task A8, inside C's Settings tab. Adding is instant; removing takes 12 hours (Reddit is mid-removal here).">
          <Phone id="settings-apps" label="Distracting apps section" height={1180}>
            <ScrollView contentContainerStyle={{ padding: space.m, paddingTop: STATUS_BAR + 16 }}>
              <View style={{ marginBottom: 12 }}>
                <Display>Settings</Display>
              </View>
              <RestrictedAppsSectionView
                apps={FAKE_APPS.slice(0, 8)}
                restricted={GALLERY_RESTRICTED}
                pending={GALLERY_PENDING}
                alwaysOpen={['com.whatsapp']}
                now={GALLERY_NOW}
                onAdd={noop}
                onRemove={noop}
                onKeep={noop}
                onToggleAlwaysOpen={noop}
              />
            </ScrollView>
          </Phone>
        </Section>

        <Section n={8} title="Notification shade" note="Task A10. Every notification Toll sends, plus the persistent one. Produced by the real router running one scripted day.">
          <Phone id="notifications" label="8.1 Notification shade" height={900}>
            <NotificationShade notices={notices} />
          </Phone>
        </Section>

        <Section n={9} title="What the blocker is told" note="Tasks A3 to A5. The enforcement planner's decision for each situation, including fail-open. This is the logic that runs on a phone.">
          <Phone id="enforcement" label="Enforcement plans" height={620} status={false}>
            <ScrollView contentContainerStyle={{ padding: space.m, gap: space.s }}>
              {rows.map((r) => (
                <Card key={r.situation}>
                  <Body muted small>{r.situation}</Body>
                  <Text style={{ fontSize: 22, fontFamily: fonts.display, color: '#c28d41' }}>{r.plan.mode}</Text>
                  <Body small>{r.summary}</Body>
                </Card>
              ))}
            </ScrollView>
          </Phone>
        </Section>
      </ScrollView>
    </ThemeChoiceContext.Provider>
  );
}

/** One sky on its own, in both themes (design section 0). */
function SkyTile({ posture }: { posture: 'open' | 'metered' | 'sealed' }) {
  const choice = React.useContext(ThemeChoiceContext);
  const modes: ThemeMode[] = choice === 'both' ? ['light', 'dark'] : [choice];
  return (
    <>
      {modes.map((m) => (
        <View key={m} style={{ gap: 6 }}>
          <View testID={`frame-sky-${posture}-${m}`} style={styles.skyTile}>
            <SkyScene posture={posture} mode={m} />
          </View>
          <Text style={styles.caption}>{`${posture === 'open' ? 'Clear' : posture === 'metered' ? 'Cloudy' : 'Storm'} · ${m}`}</Text>
        </View>
      ))}
    </>
  );
}

/** Stands in for "the distracting app you were using" behind the clouds-gathering banner. */
function StripedApp({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'monospace', fontSize: 13, color: t.muted, backgroundColor: t.bg, padding: 8, borderRadius: 8 }}>distracting app — feed</Text>
      <View style={StyleSheet.absoluteFill}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 48, gap: 64, paddingBottom: 120 },
  eyebrow: { fontSize: 13, letterSpacing: 1.2, color: '#8a5a12', fontFamily: fonts.medium },
  pageTitle: { fontSize: 64, lineHeight: 66, color: '#1d2130', fontFamily: fonts.display },
  sectionNo: { fontSize: 16, color: '#c28d41', fontFamily: fonts.medium },
  sectionTitle: { fontSize: 38, color: '#1d2130', fontFamily: fonts.display },
  sectionNote: { fontSize: 16, lineHeight: 24, color: '#565b6c', maxWidth: 760, fontFamily: fonts.body },
  subTitle: { fontSize: 26, color: '#1d2130', fontFamily: fonts.display },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' },
  phoneWrap: { width: 378, gap: 8 },
  caption: { fontSize: 13, color: '#6c6f7c', fontFamily: fonts.body },
  bezel: { width: 378, borderRadius: 48, padding: 9, backgroundColor: '#14141c', boxShadow: '0 18px 40px rgba(20,20,40,.22)' },
  screen: { flex: 1, borderRadius: 40, overflow: 'hidden' },
  statusBar: { position: 'absolute', left: 0, right: 0, top: 0, height: STATUS_BAR, paddingHorizontal: 22, justifyContent: 'center' },
  skyTile: { width: 260, height: 190, borderRadius: 22, overflow: 'hidden' },
  mascotCell: { width: 120, height: 130, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,.06)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  notice: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 6 },
  shadeLabel: { color: '#8a8e9c', fontSize: 14, fontFamily: fonts.body, marginTop: 8 },
});
