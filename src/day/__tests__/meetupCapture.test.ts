import type { Quest, Verdict } from '../../contracts';
import {
  COULDNT_READ,
  createMeetupCapture,
  fromVerifyResult,
  practiceSubmitter,
  type CaptureVerdict,
  type FileDeleter,
  type OcrPort,
} from '../meetup-capture';
import type { VerifyResult } from '../quests';
import type { MeetupCode } from '../wordlist';

const T0 = 1_763_100_000_000;
const CODE: MeetupCode = ['MAPLE', 'OTTER', 'NINE'];
const PHOTO = { uri: 'file:///cache/Camera/abc.jpg', takenAt: T0 + 60_000 };

function fakeOcr(result: string | Error): OcrPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    recognize: async (uri) => {
      calls.push(uri);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function fakeDeleter(fail = false): FileDeleter & { deleted: string[] } {
  const deleted: string[] = [];
  const fn = (async (uri: string) => {
    deleted.push(uri);
    if (fail) throw new Error('disk');
  }) as FileDeleter & { deleted: string[] };
  fn.deleted = deleted;
  return fn;
}

function setup(ocrResult: string | Error, submitResult: CaptureVerdict = { kind: 'passed', minted: 25 }) {
  const ocr = fakeOcr(ocrResult);
  const deleteFile = fakeDeleter();
  const submitted: string[] = [];
  const capture = createMeetupCapture({
    ocr,
    deleteFile,
    questStartedAt: T0,
    submit: (text) => {
      submitted.push(text);
      return submitResult;
    },
  });
  return { capture, ocr, deleteFile, submitted };
}

describe('createMeetupCapture', () => {
  test('passes when the engine accepts the OCR text, and deletes the photo', async () => {
    // Arrange
    const { capture, deleteFile, submitted } = setup('MAPLE OTTER NINE');

    // Act
    const out = await capture.check(PHOTO);

    // Assert
    expect(out).toEqual({ kind: 'passed', minted: 25 });
    expect(submitted).toEqual(['MAPLE OTTER NINE']);
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
  });

  test('asks for a retake when the engine could not read the code, and deletes the photo', async () => {
    const { capture, deleteFile } = setup('scribble', { kind: 'unreadable' });

    const out = await capture.check(PHOTO);

    expect(out).toEqual({ kind: 'unreadable', message: COULDNT_READ });
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
  });

  test('allows unlimited retakes: every unreadable photo can be followed by another', async () => {
    const { capture, deleteFile, submitted } = setup('blur', { kind: 'unreadable' });

    for (let i = 0; i < 5; i += 1) await capture.check({ ...PHOTO, uri: `file:///cache/${i}.jpg` });

    expect(submitted).toHaveLength(5);
    expect(deleteFile.deleted).toHaveLength(5);
  });

  test('treats an OCR error as unreadable, never submits, and still deletes the photo', async () => {
    const { capture, deleteFile, submitted } = setup(new Error('ml kit'));

    const out = await capture.check(PHOTO);

    expect(out).toEqual({ kind: 'unreadable', message: COULDNT_READ });
    expect(submitted).toEqual([]);
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
  });

  test('treats empty OCR text as unreadable without asking the engine', async () => {
    const { capture, submitted } = setup('   ');

    const out = await capture.check(PHOTO);

    expect(out.kind).toBe('unreadable');
    expect(submitted).toEqual([]);
  });

  test('rejects a photo taken before the quest started, without reading it, and deletes it', async () => {
    const { capture, ocr, deleteFile, submitted } = setup('MAPLE OTTER NINE');

    const out = await capture.check({ uri: PHOTO.uri, takenAt: T0 - 1 });

    expect(out.kind).toBe('stale');
    expect(ocr.calls).toEqual([]);
    expect(submitted).toEqual([]);
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
  });

  test('passes through a location wait from the engine', async () => {
    const wait: CaptureVerdict = { kind: 'wait', reason: "You're at home — meet up somewhere else", retryAt: T0 + 300_000 };
    const { capture } = setup('MAPLE OTTER NINE', wait);

    expect(await capture.check(PHOTO)).toEqual(wait);
  });

  test('still returns the result when deleting the file throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ocr = fakeOcr('MAPLE OTTER NINE');
    const deleteFile = fakeDeleter(true);
    const capture = createMeetupCapture({ ocr, deleteFile, questStartedAt: T0, submit: () => ({ kind: 'passed', minted: 25 }) });

    const out = await capture.check(PHOTO);

    expect(out.kind).toBe('passed');
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
    jest.restoreAllMocks();
  });

  test('deletes the photo even when submit throws', async () => {
    const ocr = fakeOcr('MAPLE OTTER NINE');
    const deleteFile = fakeDeleter();
    const capture = createMeetupCapture({
      ocr,
      deleteFile,
      questStartedAt: T0,
      submit: () => {
        throw new Error('engine');
      },
    });

    const out = await capture.check(PHOTO);

    expect(out.kind).toBe('unavailable');
    expect(deleteFile.deleted).toEqual([PHOTO.uri]);
  });
});

const quest: Quest = { id: 'q1', type: 'meetup', target: 2, acceptedAt: T0, expiresAt: T0 + 1, baseline: {}, status: 'passed' };
const verdict = (reason: string): Verdict => ({ questId: 'q1', pass: false, method: 'meetup_code', reason, measured: '', flags: [] });

describe('fromVerifyResult', () => {
  test.each<[VerifyResult, CaptureVerdict]>([
    [{ kind: 'passed', quest, verdict: { ...verdict('ok'), pass: true }, minted: 25, window: null }, { kind: 'passed', minted: 25 }],
    [{ kind: 'missed', verdict: verdict('x'), retryAt: null }, { kind: 'unreadable' }],
    [{ kind: 'missed', verdict: verdict('At home'), retryAt: T0 }, { kind: 'wait', reason: 'At home', retryAt: T0 }],
    [{ kind: 'wait', verdict: verdict('At home'), retryAt: T0 }, { kind: 'wait', reason: 'At home', retryAt: T0 }],
    [{ kind: 'unavailable', error: 'gone' }, { kind: 'unavailable', error: 'gone' }],
  ])('maps engine result #%#', (input, expected) => {
    expect(fromVerifyResult(input)).toEqual(expected);
  });
});

describe('practiceSubmitter', () => {
  test('passes with 2 of 3 words and mints nothing', () => {
    expect(practiceSubmitter(CODE)('MAPEL OTTER')).toEqual({ kind: 'passed', minted: 0 });
  });

  test('asks for a retake with fewer than 2 words', () => {
    expect(practiceSubmitter(CODE)('MAPLE')).toEqual({ kind: 'unreadable' });
  });
});
