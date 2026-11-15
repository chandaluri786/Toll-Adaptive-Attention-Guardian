// OWNER: B (Spec B — task B3/B4). The real StepSource on expo-sensors' Pedometer. Native: tests
// never import this file; the engine takes any StepSource. Android needs ACTIVITY_RECOGNITION.
import { Pedometer } from 'expo-sensors';
import type { StepSource } from './quests';

/** Ask for step access once; resolves false if the phone has no step counter or the user says no. */
export async function requestStepAccess(): Promise<boolean> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return false;
    const { granted } = await Pedometer.requestPermissionsAsync();
    return granted;
  } catch (e) {
    console.warn('[day] pedometer permission failed', e);
    return false;
  }
}

/** `watchStepCount` reports steps since this subscription started, which is what StepSource expects. */
export function createPedometerStepSource(): StepSource {
  return {
    subscribe(fn) {
      try {
        const sub = Pedometer.watchStepCount((r) => fn(r.steps));
        return () => sub.remove();
      } catch (e) {
        console.warn('[day] pedometer unavailable', e);
        return () => {};
      }
    },
  };
}
