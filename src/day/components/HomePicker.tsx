// OWNER: B (B1). "Use my current location" — saves home on the phone only. A refused permission
// never blocks anything: the user can set home later in Settings.
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../ui/components';
import { space } from '../../ui/theme';
import { getPlannerStore, usePlannerState } from '../store';
import { Note } from './fields';

type Status = 'idle' | 'locating' | 'saved' | 'denied' | 'unavailable';

const MESSAGES: Record<Status, string | null> = {
  idle: null,
  locating: 'Finding you…',
  saved: 'Home saved on this phone.',
  denied: 'Location is off for Toll — you can set home later in Settings.',
  unavailable: "Couldn't get a location fix — try again near a window.",
};

export default function HomePicker() {
  const { home } = usePlannerState();
  const [status, setStatus] = useState<Status>('idle');

  const useCurrentLocation = async () => {
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

  const message = MESSAGES[status] ?? (home ? 'Home is saved on this phone.' : 'No home set yet.');
  return (
    <View style={{ gap: space.s }}>
      <Note>{message}</Note>
      <Button primary={!home} title={home ? 'Update to my current location' : 'Use my current location'} onPress={useCurrentLocation} />
    </View>
  );
}
