// OWNER: B (B1). "Use my current location" — saves home on the phone only. A refused permission
// never blocks anything: the user can set home later in Settings. Design 6.3, minus the street
// address: turning coordinates into an address would send home off the phone (docs/DESIGN.md), so
// the "map" is a drawn 500 m circle, and the line under it says "Home saved".
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { fonts, radius, space, touch, type as font } from '../../ui/theme';
import { getPlannerStore, usePlannerState } from '../store';

type Status = 'idle' | 'locating' | 'saved' | 'denied' | 'unavailable';

const MESSAGES: Record<Status, string | null> = {
  idle: null,
  locating: 'Finding you…',
  saved: 'Home saved on this phone.',
  denied: 'Location is off for Toll — you can set home later in Settings.',
  unavailable: "Couldn't get a location fix — try again near a window.",
};

const CIRCLE = 150;
const PIN = 44;

/** The 500 m circle around home, drawn without any map tiles or lookup. */
function HomeCircle({ saved }: { saved: boolean }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={saved ? 'Home saved, 500 metres around it count as home' : 'No home set yet'}
      style={{ height: CIRCLE + space.xl * 2, borderRadius: radius.l, borderWidth: 1, borderColor: t.divider, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: 1, borderStyle: 'dashed', borderColor: t.gold, backgroundColor: saved ? t.goldTint : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="house" size={22} color={saved ? t.goldText : t.faint} />
        </View>
      </View>
      <View style={{ position: 'absolute', right: space.s + 2, bottom: space.s + 2, backgroundColor: t.card, borderRadius: radius.s, paddingHorizontal: space.s, paddingVertical: 2 }}>
        <Text style={{ color: t.muted, fontSize: font.small, fontFamily: fonts.body }}>500 m around home</Text>
      </View>
    </View>
  );
}

export default function HomePicker() {
  const t = useTheme();
  const { home } = usePlannerState();
  const [status, setStatus] = useState<Status>('idle');

  const locateHome = async () => {
    setStatus('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid coordinates from location fix');
      getPlannerStore().setHome({ lat, lon });
      setStatus('saved');
    } catch (e) {
      console.warn('[day] home location fix', e);
      setStatus('unavailable');
    }
  };

  const message = MESSAGES[status] ?? (home ? 'Home saved' : 'No home set yet');
  return (
    <View style={{ gap: space.m - 2 }}>
      <HomeCircle saved={!!home} />
      <Pressable
        accessibilityRole="button"
        onPress={() => void locateHome()}
        disabled={status === 'locating'}
        style={{ minHeight: 52, flexDirection: 'row', gap: space.s, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: t.divider, backgroundColor: t.card, opacity: status === 'locating' ? 0.6 : 1 }}
      >
        <Icon name="navigation" size={18} color={t.text} />
        <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.medium }}>{home ? 'Update to my current location' : 'Use my current location'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: touch.min }} accessibilityLiveRegion="polite">
        <Icon name="map-pin" size={18} color={t.muted} />
        <Text style={{ flex: 1, color: t.text, fontSize: font.body, fontFamily: fonts.body }}>{message}</Text>
      </View>
    </View>
  );
}
