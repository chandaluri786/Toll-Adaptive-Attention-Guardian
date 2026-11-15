// OWNER: A (Spec A, task A6). The Storm / Cloud screen, presentation only. Matches the approved design
// (docs/DESIGN.md, screens 1.1 to 1.8): a full-bleed sky, the weather in big serif, the reason, when it
// clears, an umbrella-time card, then the stacked choices ("doors") and a plain emergency link.
//
// It draws a StormViewModel and reports taps. No services, no timers, no navigation, so the gallery can
// render every state from plain data. The connected version is StormScreen.tsx.
//
// Strict order (planning doc, UI): 1. the weather and why  2. umbrella time  3. the choices.
// The mascot is deliberately NOT here: on this screen it stays out of the way.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Posture } from '../../contracts';
import { WeatherChip, useSky, useTheme, useThemeMode } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useOpenIn, useReducedMotion } from '../../ui/motion';
import { SkyScene } from '../../ui/SkyScene';
import { fonts, radius } from '../../ui/theme';
import { SPEND_MINUTES, type Door, type EmergencyStep, type StormViewModel, openedViewModel } from '../stormViewModel';

export type StormViewProps = {
  vm: StormViewModel;
  posture: Posture;
  emergencyStep: EmergencyStep;
  /** Set after an umbrella is bought or the emergency unlock is used: the full-screen "it's open" moment. */
  opened: ReturnType<typeof openedViewModel> | null;
  /** Space for the phone's status bar (the connected screen passes the real inset). */
  topInset?: number;
  onDoor: (key: Door['key']) => void;
  onEmergency: (action: 'tap' | 'confirm' | 'cancel') => void;
  onOpenApp: () => void;
  onDismiss: () => void;
};

export function StormView(p: StormViewProps) {
  const { vm } = p;
  const mode = useThemeMode();

  // Clouds gathering: only a banner over the app; nothing is restricted yet.
  if (vm.mode === 'grace' && vm.gather) return <GatherBanner title={vm.gather.title} body={vm.gather.body} topInset={p.topInset} onDismiss={p.onDismiss} />;

  if (p.opened) return <OpenedScreen opened={p.opened} onOpenApp={p.onOpenApp} />;

  return <Block {...p} mode={mode} />;
}

// ---- the main screen -------------------------------------------------------------------------------

function Block({ vm, posture, emergencyStep, topInset = 0, onDoor, onEmergency, onOpenApp, mode }: StormViewProps & { mode: 'light' | 'dark' }) {
  const t = useTheme();
  const sky = useSky(posture);
  const storm = posture === 'sealed';
  const waitFill = vm.doors.find((d) => d.key === 'wait')?.fill ?? 0;
  const calm = storm ? waitFill : 0; // the Storm settles while you wait
  const umbrellaColor = mode === 'dark' || storm ? '#facb8d' : '#7d5411';

  return (
    <View style={styles.fill}>
      <SkyScene posture={posture} quiet calm={calm} />
      <View style={[styles.content, { paddingTop: topInset + 14 }]}>
        {/* which app you opened */}
        <View style={styles.appRow}>
          <View style={[styles.appBadge, { backgroundColor: sky.chip }]}>
            <Text style={{ color: sky.on, fontSize: 14, fontFamily: fonts.bold }}>{vm.appLetter}</Text>
          </View>
          <Text style={{ color: sky.onMuted, fontSize: 15, fontFamily: fonts.body }}>You opened {vm.appName}</Text>
        </View>

        {/* 1. the weather and why */}
        <View style={styles.weather}>
          <WeatherChip posture={posture} />
          <Text style={[styles.weatherWord, { color: sky.on }]}>{vm.weatherName}</Text>
          <Text style={[styles.reason, { color: sky.on }]}>{vm.reason}</Text>
          {vm.clears && (
            <View style={styles.clears}>
              <Icon name="clock" size={16} color={sky.onMuted} />
              <Text style={{ color: sky.onMuted, fontSize: 16, fontFamily: fonts.body }}>{vm.clears}</Text>
            </View>
          )}
          {!!vm.note && <Text style={{ color: sky.onMuted, fontSize: 15, fontFamily: fonts.body }}>{vm.note}</Text>}
        </View>

        <View style={{ flex: 1 }} />

        {/* 2. umbrella time */}
        <View style={[styles.umbrella, { backgroundColor: sky.chip }]}>
          <Icon name="umbrella" size={24} color={umbrellaColor} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: sky.onMuted, fontSize: 15, fontFamily: fonts.body }}>Umbrella time</Text>
            <Text style={{ color: sky.onMuted, fontSize: 14, fontFamily: fonts.body }}>{vm.umbrella.note}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ color: sky.on, fontSize: 40, lineHeight: 40, fontFamily: fonts.displaySemi }}>{vm.umbrella.minutes}</Text>
            <Text style={{ color: sky.on, fontSize: 15, fontFamily: fonts.body }}>min</Text>
          </View>
        </View>

        {/* 3. the choices (Clear skies has none: just go on in) */}
        {vm.mode === 'clear' && (
          <Pressable accessibilityRole="button" onPress={onOpenApp} style={[styles.openApp, { backgroundColor: t.primaryBg, marginTop: 0, alignSelf: 'stretch' }]}>
            <Text style={{ color: t.primaryText, fontSize: 17, fontFamily: fonts.medium }}>{`Open ${vm.appName}`}</Text>
          </Pressable>
        )}
        <View style={{ gap: 10 }}>
          {vm.doors.map((d) => (
            <DoorButton key={d.key} door={d} posture={posture} onPress={() => onDoor(d.key)} />
          ))}
        </View>

        {vm.mode !== 'clear' && <EmergencyLink vm={vm} step={emergencyStep} onAction={onEmergency} posture={posture} />}
      </View>

      {emergencyStep === 'confirming' && <ConfirmDialog onAction={onEmergency} />}
    </View>
  );
}

/** One stacked choice: a round icon, a title and a hint. Primary is the design's peach. */
function DoorButton({ door, posture, onPress }: { door: Door; posture: Posture; onPress: () => void }) {
  const t = useTheme();
  const sky = useSky(posture);
  const mode = useThemeMode();
  const primary = door.variant === 'primary';
  const disabled = door.variant === 'disabled';

  const bg = primary ? t.primaryBg : disabled ? 'transparent' : sky.btn;
  const border = primary ? t.primaryBg : sky.btnLine;
  const color = primary ? t.primaryText : sky.on;
  const subColor = primary ? '#5a3b0a' : sky.onMuted;
  const iconBg = primary ? 'rgba(58,39,13,.08)' : sky.chip;
  const fillBg = mode === 'dark' || posture === 'sealed' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.55)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.door, { backgroundColor: bg, borderColor: border, borderStyle: disabled ? 'dashed' : 'solid' }]}
    >
      {door.fill > 0 && <Fill fraction={door.fill} color={fillBg} />}
      <View style={[styles.doorIcon, { backgroundColor: iconBg }]}>
        <Icon name={door.icon} size={21} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color, fontSize: 17, fontFamily: fonts.medium }}>{door.title}</Text>
        <Text style={{ color: subColor, fontSize: 14, lineHeight: 19, fontFamily: fonts.body }}>{door.sub}</Text>
      </View>
    </Pressable>
  );
}

/** The wait's progress behind a door. The design eases the width over .25 s (`transition: width .25s linear`). */
function Fill({ fraction, color }: { fraction: number; color: string }) {
  const w = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: fraction, duration: 250, easing: Easing.linear, useNativeDriver: false }).start();
  }, [fraction, w]);
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <Animated.View style={[StyleSheet.absoluteFill, { right: undefined, width, backgroundColor: color }]} />;
}

/** The plain link, its step-2 panel, or the "already used" line. Two taps plus a confirm. */
function EmergencyLink({ vm, step, onAction, posture }: { vm: StormViewModel; step: EmergencyStep; onAction: StormViewProps['onEmergency']; posture: Posture }) {
  const sky = useSky(posture);
  if (step === 'armed') {
    return (
      <View style={[styles.panel, { backgroundColor: sky.chip }]}>
        <Text style={{ color: sky.on, fontSize: 15, lineHeight: 21, fontFamily: fonts.body }}>Every app opens for {SPEND_MINUTES} minutes. You get one a day.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => onAction('cancel')} style={[styles.panelBtn, { borderColor: sky.btnLine }]}>
            <Text style={{ color: sky.on, fontSize: 15, fontFamily: fonts.medium }}>Never mind</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onAction('tap')} style={[styles.panelBtn, { borderColor: sky.on }]}>
            <Text style={{ color: sky.on, fontSize: 15, fontFamily: fonts.medium }}>Unlock {SPEND_MINUTES} min</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!vm.emergency.available) {
    return <Text style={[styles.emUsed, { color: sky.onMuted }]}>{vm.emergency.label}</Text>;
  }
  if (step === 'idle') {
    return (
      <Text accessibilityRole="link" onPress={() => onAction('tap')} style={[styles.emLink, { color: sky.onMuted }]}>
        {vm.emergency.label}
      </Text>
    );
  }
  return null;
}

function ConfirmDialog({ onAction }: { onAction: StormViewProps['onEmergency'] }) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: t.scrim }]}>
      <View accessibilityRole="alert" style={[styles.dialog, { backgroundColor: t.card }]}>
        <Icon name="life-buoy" size={28} color={t.storm} />
        <Text style={{ color: t.text, fontSize: 21, lineHeight: 26, fontFamily: fonts.medium }}>Use today's emergency unlock?</Text>
        <Text style={{ color: t.muted, fontSize: 16, lineHeight: 23, fontFamily: fonts.body }}>
          Every app opens for {SPEND_MINUTES} minutes. The next one comes back at 04:00 tomorrow.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => onAction('cancel')} style={styles.dialogCancel}>
            <Text style={{ color: t.text, fontSize: 15, fontFamily: fonts.medium }}>Not now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onAction('confirm')} style={[styles.dialogOk, { borderColor: t.storm, backgroundColor: t.stormTint }]}>
            <Text style={{ color: t.text, fontSize: 15, fontFamily: fonts.medium }}>Yes, unlock</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Screen 1.8: a card over the app you are using. Nothing is restricted yet. */
export function GatherBanner({ title, body, topInset = 0, onDismiss }: { title: string; body: string; topInset?: number; onDismiss: () => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.gather, { top: topInset + 8, backgroundColor: t.card, borderColor: t.divider }]}>
      <View style={[styles.gatherIcon, { backgroundColor: t.stormTint }]}>
        <Icon name="cloud-lightning" size={22} color={t.storm} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: t.text, fontSize: 16, fontFamily: fonts.medium }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21, fontFamily: fonts.body }}>{body}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.gatherX}>
        <Icon name="x" size={20} color={t.muted} />
      </Pressable>
    </View>
  );
}

/** Screen 1.7: the moment after an umbrella opens (or the emergency unlock is used). */
function OpenedScreen({ opened, onOpenApp }: { opened: NonNullable<StormViewProps['opened']>; onOpenApp: () => void }) {
  const t = useTheme();
  const sky = useSky(opened.weather);
  const popIn = useOpenIn(useReducedMotion());
  return (
    <View style={[styles.fill, styles.opened]}>
      <SkyScene posture={opened.weather} quiet />
      <Animated.View style={popIn}>
        <Icon name={opened.icon} size={112} color={t.gold} strokeWidth={1.5} />
      </Animated.View>
      <Text style={[styles.openedTitle, { color: sky.on }]}>{opened.title}</Text>
      <Text style={[styles.openedSub, { color: sky.onMuted }]}>{opened.sub}</Text>
      <Pressable accessibilityRole="button" onPress={onOpenApp} style={[styles.openApp, { backgroundColor: t.primaryBg }]}>
        <Text style={{ color: t.primaryText, fontSize: 17, fontFamily: fonts.medium }}>{opened.button}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 18 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appBadge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  weather: { marginTop: 48, gap: 10, alignItems: 'flex-start' },
  weatherWord: { fontFamily: fonts.display, fontSize: 68, lineHeight: 65, letterSpacing: -1.4 },
  reason: { fontFamily: fonts.medium, fontSize: 21, lineHeight: 27, maxWidth: 300 },
  clears: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  umbrella: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, marginBottom: 14 },
  door: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, overflow: 'hidden' },
  doorIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emLink: { alignSelf: 'center', minHeight: 44, marginTop: 8, paddingHorizontal: 12, paddingTop: 12, fontSize: 15, fontFamily: fonts.body, textDecorationLine: 'underline' },
  emUsed: { alignSelf: 'center', minHeight: 44, marginTop: 8, paddingTop: 12, fontSize: 15, textAlign: 'center', fontFamily: fonts.body },
  panel: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, gap: 12 },
  panelBtn: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scrim: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', borderRadius: 26, padding: 24, gap: 12, boxShadow: '0 20px 50px rgba(0,0,0,.3)' },
  dialogCancel: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dialogOk: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  gather: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 16, borderRadius: 22, borderWidth: 1, boxShadow: '0 10px 30px rgba(20,20,50,.18)' },
  gatherIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  gatherX: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  opened: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  openedTitle: { fontFamily: fonts.display, fontSize: 42, lineHeight: 44, textAlign: 'center' },
  openedSub: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, maxWidth: 270, textAlign: 'center' },
  openApp: { marginTop: 18, minHeight: 52, paddingHorizontal: 28, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

