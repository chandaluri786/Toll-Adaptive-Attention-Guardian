// OWNER: B (Spec B — task B7). Meetup code capture: photo → on-device OCR → engine check, with the
// photo deleted straight after, whatever happens. Pure: OCR, file deletion and the engine's
// submitMeetupPhoto are injected (real adapters: ./ocr-mlkit.ts, ./capture-files.ts).
// Evidence rules: in-app capture only, the image is never stored, OCR text is never logged.
import type { VerifyResult } from './quests';
import { matchMeetupCode } from './verifiers';
import type { MeetupCode } from './wordlist';

/** Copy from design 3.9. */
export const COULDNT_READ = "Couldn't read it — try bigger letters.";
const STALE_PHOTO = 'That photo is from before this quest — snap a new one.';

export type OcrPort = { recognize(imageUri: string): Promise<string> };
export type FileDeleter = (uri: string) => Promise<void> | void;
export type CapturedPhoto = { uri: string; takenAt: number };

/** What the engine (or the practice check) says about one OCR text. */
export type CaptureVerdict =
  | { kind: 'passed'; minted: number }
  | { kind: 'unreadable' }
  | { kind: 'wait'; reason: string; retryAt: number }
  | { kind: 'unavailable'; error: string };

export type CaptureOutcome =
  | { kind: 'passed'; minted: number }
  | { kind: 'unreadable'; message: string }
  | { kind: 'stale'; message: string }
  | { kind: 'wait'; reason: string; retryAt: number }
  | { kind: 'unavailable'; error: string };

export type MeetupCaptureDeps = {
  ocr: OcrPort;
  deleteFile: FileDeleter;
  /** Quest.acceptedAt: a photo taken earlier is not evidence for this quest. */
  questStartedAt: number;
  submit: (ocrText: string) => CaptureVerdict;
};

export type MeetupCapture = { check(photo: CapturedPhoto): Promise<CaptureOutcome> };

/** Engine result → capture verdict. A miss with no wait is a misread (unlimited retakes). */
export function fromVerifyResult(r: VerifyResult): CaptureVerdict {
  switch (r.kind) {
    case 'passed':
      return { kind: 'passed', minted: r.minted };
    case 'missed':
      return r.retryAt === null ? { kind: 'unreadable' } : { kind: 'wait', reason: r.verdict.reason, retryAt: r.retryAt };
    case 'wait':
      return { kind: 'wait', reason: r.verdict.reason, retryAt: r.retryAt };
    case 'unavailable':
      return { kind: 'unavailable', error: r.error };
  }
}

/** Local check for the hour-6 handwriting test while the fake day module is live: no credit. */
export function practiceSubmitter(code: MeetupCode) {
  return (ocrText: string): CaptureVerdict => (matchMeetupCode(ocrText, code) ? { kind: 'passed', minted: 0 } : { kind: 'unreadable' });
}

function toOutcome(v: CaptureVerdict): CaptureOutcome {
  return v.kind === 'unreadable' ? { kind: 'unreadable', message: COULDNT_READ } : v;
}

async function readText(ocr: OcrPort, uri: string): Promise<string | null> {
  try {
    const text = await ocr.recognize(uri);
    return typeof text === 'string' && text.trim().length > 0 ? text : null;
  } catch {
    return null; // OCR errors read as "couldn't read it"; never log the image or text
  }
}

async function safeDelete(deleteFile: FileDeleter, uri: string) {
  try {
    await deleteFile(uri);
  } catch {
    console.warn('[day] meetup photo cleanup did not complete');
  }
}

export function createMeetupCapture(deps: MeetupCaptureDeps): MeetupCapture {
  async function evaluatePhoto(photo: CapturedPhoto): Promise<CaptureOutcome> {
    if (!(photo.takenAt >= deps.questStartedAt)) return { kind: 'stale', message: STALE_PHOTO };
    const text = await readText(deps.ocr, photo.uri);
    if (text === null) return { kind: 'unreadable', message: COULDNT_READ };
    try {
      return toOutcome(deps.submit(text));
    } catch {
      return { kind: 'unavailable', error: 'Something went wrong checking the code — try again.' };
    }
  }

  return {
    async check(photo) {
      try {
        return await evaluatePhoto(photo);
      } finally {
        await safeDelete(deps.deleteFile, photo.uri);
      }
    },
  };
}
