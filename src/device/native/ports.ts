// OWNER: A (Spec A, tasks A7, A8, A10). Real PermissionsPort, InstalledAppsPort and Notifier.
//
// !! NOT VERIFIED ON A PHONE !!  These call Expo modules whose function names were checked against the
// installed SDK 58 typings, but they have only been type-checked, never run on a device.
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';
import { getInstalledApps, getPermissionStatus, openOverlaySettings, openUsageStatsSettings } from './appBlocker';
import type { InstalledAppsPort, Notifier, PermissionId, PermissionStatus, PermissionsPort } from '../ports';

// ---- permissions -----------------------------------------------------------------------------

export function createNativePermissions(): PermissionsPort {
  return {
    async status(): Promise<PermissionStatus> {
      // Usage access, overlay and notifications come from the blocker; the rest from their Expo modules.
      const blocker = await getPermissionStatus();
      const android = blocker.details.platform === 'android' ? blocker.details : null;
      const [loc, cam, motion] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Camera.getCameraPermissionsAsync(),
        Pedometer.getPermissionsAsync(),
      ]);
      return {
        usage: android?.usageStats ?? false,
        overlay: android?.overlay ?? false,
        notifications: android?.notifications ?? false,
        location: loc.granted,
        camera: cam.granted,
        motion: motion.granted,
      };
    },

    async request(id: PermissionId): Promise<void> {
      switch (id) {
        // These two open a system settings page; there is no callback, so the app re-checks on resume.
        case 'usage':
          return openUsageStatsSettings();
        case 'overlay':
          return openOverlaySettings();
        case 'notifications':
          await Notifications.requestPermissionsAsync();
          return;
        case 'location':
          await Location.requestForegroundPermissionsAsync();
          return;
        case 'camera':
          await Camera.requestCameraPermissionsAsync();
          return;
        case 'motion':
          await Pedometer.requestPermissionsAsync();
          return;
      }
    },
  };
}

// ---- installed apps --------------------------------------------------------------------------

export function createNativeInstalledApps(): InstalledAppsPort {
  return {
    async list() {
      const apps = await getInstalledApps();
      return apps.map((a) => ({ pkg: a.packageName, name: a.name })).sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---- notifications ---------------------------------------------------------------------------

const CHANNEL_ID = 'toll';

export function createNativeNotifier(): Notifier {
  // Show notifications even while the app is open (the default is to stay silent in the foreground).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Toll',
      importance: Notifications.AndroidImportance.DEFAULT, // no sound or heads-up: notification fatigue kills the product
    });
  }
  return {
    async show(n) {
      await Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
      });
    },
  };
}
