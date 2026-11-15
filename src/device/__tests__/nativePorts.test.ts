// OWNER: A (tasks A7, A10). The real notifier and permission check, with the native modules mocked.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  AndroidImportance: { LOW: 2, DEFAULT: 3, HIGH: 4 },
}));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn() }));
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: jest.fn() } }));
jest.mock('expo-sensors', () => ({ Pedometer: { getPermissionsAsync: jest.fn() } }));
jest.mock('../native/appBlocker', () => ({ getPermissionStatus: jest.fn() }));

import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { getPermissionStatus } from '../native/appBlocker';
import { BLOCKER_ALERT_CHANNEL_ID, createNativeNotifier, createNativePermissions } from '../native/ports';

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const setChannel = Notifications.setNotificationChannelAsync as jest.Mock;

describe('native notifier', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives notices with a replaceId a fixed identifier, so they replace each other', async () => {
    // Arrange
    const notifier = createNativeNotifier();

    // Act
    await notifier.show({ kind: 'weather_change', title: 'Cloudy now', body: 'r', at: 0, replaceId: 'weather' });
    await notifier.show({ kind: 'quest_verified', title: 'Done', body: 'r', at: 0 });

    // Assert
    expect(schedule.mock.calls[0][0]).toMatchObject({ identifier: 'weather' });
    expect(schedule.mock.calls[1][0]).not.toHaveProperty('identifier');
  });

  it('turns the blocker intercept notification down to a quiet one (no heads-up)', () => {
    // Act
    createNativeNotifier();

    // Assert
    expect(setChannel).toHaveBeenCalledWith(BLOCKER_ALERT_CHANNEL_ID, expect.objectContaining({ importance: Notifications.AndroidImportance.LOW }));
  });
});
