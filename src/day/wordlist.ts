// OWNER: B (Spec B — task B7). Meetup code words, per "The meetup code protocol" in the planning doc:
// 4–6 letters, common English, written in block capitals, and no letters OCR confuses with digits
// (no I, L or O, so no 1/l/0 lookalikes either).
import { levenshtein } from './verifiers';

export const MEETUP_WORDS: readonly string[] = [
  'BEACH', 'BERRY', 'CAMP', 'CARD', 'CHEF', 'CREEK', 'CRUST', 'DANCE', 'DESK', 'DUST',
  'FARM', 'FENCE', 'FERRY', 'GRAPE', 'GREEN', 'HARP', 'HEART', 'HUNT', 'JUMP', 'KEYS',
  'MARCH', 'MASK', 'NEST', 'PARK', 'PEACH', 'PUPPY', 'RAVEN', 'RUBY', 'SAND', 'SHARK',
  'SNACK', 'SPARK', 'STAR', 'STEAM', 'SUGAR', 'SWAN', 'TAPE', 'TENT', 'TRUCK', 'TUNA',
  'WAVE', 'WREN', 'ZEBRA', 'BRUSH', 'CRAB', 'DRUM', 'FEAST', 'HAZE', 'JADE', 'NURSE',
  'PAPER', 'RAFT', 'SEED', 'TRAP', 'VASE', 'WHEAT', 'YARN',
];

export type MeetupCode = [string, string, string];

/** Fuzzy matching allows distance 2, so the three words must be further apart than that. */
const MIN_DISTANCE_BETWEEN_WORDS = 3;

/** Three different words that OCR cannot mistake for one another. `rng` is injectable for tests. */
export function generateMeetupCode(rng: () => number = Math.random): MeetupCode {
  const picked: string[] = [];
  while (picked.length < 3) {
    const word = MEETUP_WORDS[Math.floor(rng() * MEETUP_WORDS.length)];
    const tooClose = picked.some((p) => levenshtein(p, word) < MIN_DISTANCE_BETWEEN_WORDS);
    if (!tooClose) picked.push(word);
  }
  return [picked[0], picked[1], picked[2]];
}
