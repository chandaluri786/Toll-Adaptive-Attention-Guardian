// OWNER: B (Spec B — tasks B4–B7). Verifiers are pure functions over recorded signals, so they
// are unit-testable with A's scripted DeviceSignals fake. Rules: "Task verification" in the doc.
import type { LocationSample, Verdict } from '../contracts';

/** B4: steps since the quest's baseline. Reject under 5 min; flag over 200 steps/min. */
export function verifySteps(_questId: string, _steps: number, _minutes: number, _target: number): Verdict {
  throw new Error('verifySteps not implemented yet — task B4');
}

/** B5: longest continuous screen-off stretch since accept must reach the target. */
export function verifyScreenOff(
  _questId: string,
  _events: { at: number; on: boolean }[],
  _targetMin: number,
): Verdict {
  throw new Error('verifyScreenOff not implemented yet — task B5');
}

/** B6: minutes over 500 m from home with accuracy ≤ 100 m; any mocked sample fails at once. */
export function verifyAwayFromHome(
  _questId: string,
  _samples: LocationSample[],
  _home: { lat: number; lon: number },
  _targetMin: number,
): Verdict {
  throw new Error('verifyAwayFromHome not implemented yet — task B6');
}

/** B7: OCR text matches the three-word code (2 of 3 words, Levenshtein ≤ 2). */
export function matchMeetupCode(_ocrText: string, _code: [string, string, string]): boolean {
  throw new Error('matchMeetupCode not implemented yet — task B7');
}

/** Haversine distance in metres — ready for B6. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
