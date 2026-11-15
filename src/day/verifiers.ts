// OWNER: B (Spec B — tasks B4–B7). Verifiers are pure functions over recorded signals, so they
// are unit-testable with A's scripted DeviceSignals fake. Rules: "Task verification" in the doc.
// Copy rule: a miss gives a plain, kind reason. Never "failed", never "blocked".
import type { LocationSample, Verdict } from '../contracts';
import { MIN } from '../shared/emitter';

export const STEP_MIN_MINUTES = 5;
export const STEP_MAX_PER_MINUTE = 200;
export const AWAY_RADIUS_M = 500;
export const MAX_ACCURACY_M = 100;
/** Samples arrive every 60 s; a longer silence means we can't vouch for the time in between. */
const MAX_SAMPLE_GAP_MS = 2 * MIN;
const MIN_OCR_TOKEN_LENGTH = 3;
const MAX_OCR_DISTANCE = 2;
const WORDS_NEEDED = 2;
const MOCKED_REASON = 'Location looks simulated — turn off mock-location apps';

const fmt = (n: number) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const roundTo10 = (m: number) => Math.round(m / 10) * 10;

function verdict(questId: string, method: Verdict['method'], pass: boolean, reason: string, measured: string, flags: string[] = []): Verdict {
  return { questId, pass, method, reason, measured, flags };
}

/** B4: steps since the quest's baseline. Reject under 5 min; flag over 200 steps/min. */
export function verifySteps(questId: string, steps: number, minutes: number, target: number): Verdict {
  const measured = `${fmt(steps)} of ${fmt(target)}`;
  if (minutes < STEP_MIN_MINUTES) {
    return verdict(questId, 'step_delta', false, `Give it at least ${STEP_MIN_MINUTES} min of walking`, measured);
  }
  const flags = steps / minutes > STEP_MAX_PER_MINUTE ? ['implausible_pace'] : [];
  if (steps >= target) return verdict(questId, 'step_delta', true, `${fmt(steps)} steps — nice walk`, measured, flags);
  return verdict(questId, 'step_delta', false, `${measured} steps so far — keep walking`, measured, flags);
}

/** Longest continuous screen-off stretch in ms. An off stretch still open counts up to `now`. */
export function longestScreenOffMs(events: { at: number; on: boolean }[], now?: number): number {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  let longest = 0;
  let offSince: number | null = null;
  for (const e of sorted) {
    if (!e.on && offSince === null) offSince = e.at;
    if (e.on && offSince !== null) {
      longest = Math.max(longest, e.at - offSince);
      offSince = null;
    }
  }
  if (offSince !== null && now !== undefined) longest = Math.max(longest, now - offSince);
  return longest;
}

/** B5: longest continuous screen-off stretch since accept must reach the target. */
export function verifyScreenOff(
  questId: string,
  events: { at: number; on: boolean }[],
  targetMin: number,
  now?: number,
): Verdict {
  const minutes = Math.floor(longestScreenOffMs(events, now) / MIN);
  const measured = `${Math.min(minutes, targetMin)} of ${targetMin} min`;
  if (minutes >= targetMin) return verdict(questId, 'screen_off', true, `${targetMin} minutes with the phone down`, measured);
  return verdict(questId, 'screen_off', false, `Phone down for ${minutes} min — need ${targetMin} in a row`, measured);
}

/** One location sample counts as "away": over 500 m from home, accurate to 100 m, not mocked. */
export function isAwaySample(s: LocationSample, home: { lat: number; lon: number }): boolean {
  return !s.mocked && s.accuracyM <= MAX_ACCURACY_M && distanceM(home, s) > AWAY_RADIUS_M;
}

/** Longest run of consecutive away samples, one minute each; a bad sample or a gap resets it. */
export function longestAwayMinutes(samples: LocationSample[], home: { lat: number; lon: number }): number {
  const sorted = [...samples].sort((a, b) => a.at - b.at);
  let longest = 0;
  let run = 0;
  let prevAt: number | null = null;
  for (const s of sorted) {
    const continuous = prevAt === null || s.at - prevAt <= MAX_SAMPLE_GAP_MS;
    run = isAwaySample(s, home) ? (continuous ? run + 1 : 1) : 0;
    longest = Math.max(longest, run);
    prevAt = s.at;
  }
  return longest;
}

/** Plain reason for why the latest sample does not count, or null if it does. */
export function locationMissReason(s: LocationSample | null, home: { lat: number; lon: number }): string | null {
  if (!s) return 'Waiting for a location fix';
  if (s.mocked) return MOCKED_REASON;
  if (s.accuracyM > MAX_ACCURACY_M) return 'Location is fuzzy right now — try somewhere with open sky';
  const d = distanceM(home, s);
  if (d <= AWAY_RADIUS_M) return `You're ${roundTo10(d)} m from home — need ${AWAY_RADIUS_M} m`;
  return null;
}

/** B6: minutes over 500 m from home with accuracy ≤ 100 m; any mocked sample fails at once. */
export function verifyAwayFromHome(
  questId: string,
  samples: LocationSample[],
  home: { lat: number; lon: number },
  targetMin: number,
): Verdict {
  if (samples.some((s) => s.mocked)) {
    return verdict(questId, 'away_minutes', false, MOCKED_REASON, `0 of ${targetMin} min`, ['mocked_location']);
  }
  const minutes = longestAwayMinutes(samples, home);
  const measured = `${Math.min(minutes, targetMin)} of ${targetMin} min`;
  if (minutes >= targetMin) return verdict(questId, 'away_minutes', true, `${targetMin} minutes out and about`, measured);
  const latest = samples.reduce<LocationSample | null>((a, s) => (!a || s.at > a.at ? s : a), null);
  const reason = locationMissReason(latest, home) ?? `${minutes} of ${targetMin} min away — keep going`;
  return verdict(questId, 'away_minutes', false, reason, measured);
}

/** Edit distance between two strings (insert, delete, substitute). */
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[b.length];
}

/** How many code words appear in the OCR text; each OCR token can stand for one word only. */
export function countMeetupWords(ocrText: string, code: readonly string[]): number {
  const tokens = ocrText.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= MIN_OCR_TOKEN_LENGTH);
  const used = new Set<number>();
  let matched = 0;
  for (const word of code) {
    const idx = tokens.findIndex((t, i) => !used.has(i) && levenshtein(t, word) <= MAX_OCR_DISTANCE);
    if (idx >= 0) {
      used.add(idx);
      matched += 1;
    }
  }
  return matched;
}

/** B7: OCR text matches the three-word code (2 of 3 words, Levenshtein ≤ 2). */
export function matchMeetupCode(ocrText: string, code: [string, string, string]): boolean {
  return countMeetupWords(ocrText, code) >= WORDS_NEEDED;
}

/** B7 verdict: the code must read AND the latest location must be away from home. */
export function verifyMeetup(
  questId: string,
  ocrText: string,
  code: [string, string, string],
  latest: LocationSample | null,
  home: { lat: number; lon: number },
): Verdict {
  const words = countMeetupWords(ocrText, code);
  const measured = `${words} of 3 words`;
  if (latest?.mocked) return verdict(questId, 'meetup_code', false, MOCKED_REASON, measured, ['mocked_location']);
  if (words < WORDS_NEEDED) return verdict(questId, 'meetup_code', false, "Couldn't read it — try larger letters", measured);
  const miss = locationMissReason(latest, home);
  if (miss) return verdict(questId, 'meetup_code', false, miss, measured);
  return verdict(questId, 'meetup_code', true, 'Code matched — enjoy the meetup', measured);
}

/** Haversine distance in metres. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
