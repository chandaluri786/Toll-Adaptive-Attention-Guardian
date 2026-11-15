// OWNER: A (task A2). The native config call writes EVERY key, so each call must carry the whole config.
import * as Blocker from 'expo-app-blocker';
import { configureOverlay, createNativeBlocker } from '../native/appBlocker';
// jest.mock is hoisted above the imports by babel-jest.
jest.mock('expo-app-blocker', () => ({ configureAndroid: jest.fn() }));

const configureAndroid = Blocker.configureAndroid as jest.Mock;
const lastConfig = () => configureAndroid.mock.calls[configureAndroid.mock.calls.length - 1][0];

beforeEach(() => configureAndroid.mockClear());

describe('native blocker config', () => {
  it('keeps the overlay when the notification text changes', () => {
    // Arrange
    configureOverlay();
    const blocker = createNativeBlocker();

    // Act
    blocker.setNotificationText('Cloudy · umbrella 12 min', 'Free time is used up for today.');

    // Assert
    expect(lastConfig()).toMatchObject({
      overlayTitle: 'Toll',
      overlayText: 'Checking the weather…',
      overlayBackgroundColor: '#1A1440',
      overlayTitleColor: '#F4F1FF',
      overlayTextColor: '#C9C2FF',
      notificationTitle: 'Cloudy · umbrella 12 min',
      notificationText: 'Free time is used up for today.',
    });
  });

  it('keeps the latest notification text when the overlay is configured again', () => {
    // Arrange
    const blocker = createNativeBlocker();
    blocker.setNotificationText('Storm · umbrella 0 min', 'Changes at 11:00.');

    // Act
    configureOverlay();

    // Assert
    expect(lastConfig()).toMatchObject({ overlayTitle: 'Toll', notificationTitle: 'Storm · umbrella 0 min', notificationText: 'Changes at 11:00.' });
  });

  it('does not call native again when the notification text is unchanged', () => {
    // Arrange
    const blocker = createNativeBlocker();
    blocker.setNotificationText('Clear skies · umbrella 30 min', '2 h 0 m of free time left.');
    configureAndroid.mockClear();

    // Act
    blocker.setNotificationText('Clear skies · umbrella 30 min', '2 h 0 m of free time left.');

    // Assert
    expect(configureAndroid).not.toHaveBeenCalled();
  });
});
