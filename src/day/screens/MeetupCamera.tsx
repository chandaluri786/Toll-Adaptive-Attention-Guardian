// OWNER: B (task B7). Design 3.8 (camera framing guide) and 3.9 (couldn't read it → Retake).
// In-app capture only: no gallery picker. The shot goes straight to `onShot`; the flow OCRs it
// and deletes the file. Native (expo-camera): tests never import this file.
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Button, useSky, useTheme } from '../../ui/components';
import { fonts, radius, space, touch, type as font } from '../../ui/theme';
import { formatCode } from '../components/MeetupCodeCard';
import type { MeetupCode } from '../wordlist';

export type CameraNotice = string | null;
type Props = { code: MeetupCode; busy: boolean; notice: CameraNotice; onShot: (uri: string) => void; onRetake: () => void };

const CORNER = 26;
const SHUTTER = 64;

function FrameGuide() {
  const c = useSky('sealed').on;
  const edge = (pos: object, sides: object) => <View style={[{ position: 'absolute', width: CORNER, height: CORNER, borderColor: c }, pos, sides]} />;
  return (
    <View style={{ width: '80%', aspectRatio: 1.6, alignSelf: 'center' }}>
      {edge({ top: 0, left: 0 }, { borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 })}
      {edge({ top: 0, right: 0 }, { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 })}
      {edge({ bottom: 0, left: 0 }, { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 })}
      {edge({ bottom: 0, right: 0 }, { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 })}
    </View>
  );
}

function Header({ code }: { code: MeetupCode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s }}>
      <Text style={{ color: t.text, fontSize: font.title, fontFamily: fonts.medium }}>Snap the code</Text>
      <Text style={{ color: t.muted, fontSize: font.small, letterSpacing: 1, flexShrink: 1 }}>{formatCode(code)}</Text>
    </View>
  );
}

function PermissionAsk({ onAllow }: { onAllow: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.m }}>
      <Text style={{ color: t.text, fontSize: font.body }}>Toll needs the camera to read the code. The photo is checked on your phone and deleted right away.</Text>
      <Button primary title="Allow camera" onPress={onAllow} />
    </View>
  );
}

export function MeetupCamera({ code, busy, notice, onShot, onRetake }: Props) {
  const t = useTheme();
  const storm = useSky('sealed');
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);

  const snap = async () => {
    if (!camera.current || !ready || busy) return;
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.8, exif: false });
      if (pic?.uri) onShot(pic.uri);
    } catch {
      console.warn('[day] meetup camera capture did not complete');
    }
  };

  if (!permission) return <ActivityIndicator color={t.gold} />;
  if (!permission.granted) return <PermissionAsk onAllow={() => void requestPermission()} />;

  return (
    <View style={{ gap: space.m }}>
      <Header code={code} />
      <View style={{ height: 420, borderRadius: radius.l, overflow: 'hidden', backgroundColor: storm.top }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', gap: space.m }}>
          <FrameGuide />
          <Text style={{ color: storm.on, fontSize: font.small, textAlign: 'center' }}>Fit the paper inside the frame</Text>
        </View>
        {!!notice && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', top: space.m, left: space.m, right: space.m, backgroundColor: t.card, borderRadius: radius.m, padding: space.m }}>
            <Text style={{ color: t.text, fontSize: font.body }}>{notice}</Text>
          </View>
        )}
      </View>
      {busy ? (
        <View style={{ minHeight: SHUTTER, alignItems: 'center', justifyContent: 'center', gap: space.s }}>
          <ActivityIndicator color={t.gold} />
          <Text style={{ color: t.muted, fontSize: font.body }}>Reading it on your phone…</Text>
        </View>
      ) : notice ? (
        <Button primary title="Retake" onPress={onRetake} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          disabled={!ready}
          onPress={() => void snap()}
          style={{ alignSelf: 'center', width: SHUTTER, height: SHUTTER, minHeight: touch.min, borderRadius: radius.pill, borderWidth: 4, borderColor: t.text, padding: 4, opacity: ready ? 1 : 0.5 }}
        >
          <View style={{ flex: 1, borderRadius: radius.pill, backgroundColor: t.text }} />
        </Pressable>
      )}
    </View>
  );
}
