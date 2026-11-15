// OWNER: B (task B7). Meetup capture flow inside the quest sheet: code (3.7) → camera (3.8) →
// couldn't read it (3.9, unlimited retakes, no penalty) or pass. Wires the real OCR + file
// deletion into the pure controller in ../meetup-capture.ts.
import React, { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../ui/components';
import { space, type as font } from '../../ui/theme';
import { deleteCapturedPhoto } from '../capture-files';
import { MeetupCodeCard } from '../components/MeetupCodeCard';
import { createMeetupCapture, type CaptureOutcome, type CaptureVerdict } from '../meetup-capture';
import { mlKitOcr } from '../ocr-mlkit';
import type { MeetupCode } from '../wordlist';
import { MeetupCamera } from './MeetupCamera';

type Props = {
  code: MeetupCode;
  questStartedAt: number;
  now: () => number;
  submit: (ocrText: string) => CaptureVerdict;
  /** OCR check mode (fake day module): shows what the phone read, mints nothing. */
  practice?: boolean;
  onClose: () => void;
};

type Step = { kind: 'code' } | { kind: 'camera'; notice: string | null } | { kind: 'done'; text: string };

function noticeFor(out: Exclude<CaptureOutcome, { kind: 'passed' }>): string {
  switch (out.kind) {
    case 'unreadable':
    case 'stale':
      return out.message;
    case 'wait':
      return `${out.reason}. Try again in 5 min.`;
    case 'unavailable':
      return out.error;
  }
}

function passText(minted: number, practice: boolean): string {
  if (practice) return 'Read it — the code matches.';
  return minted > 0 ? `Passed — ${minted} minutes dropped into your umbrella.` : 'Passed — umbrella up straight away.';
}

export function MeetupFlow({ code, questStartedAt, now, submit, practice = false, onClose }: Props) {
  const t = useTheme();
  const [step, setStep] = useState<Step>({ kind: 'code' });
  const [busy, setBusy] = useState(false);
  const lastRead = useRef('');

  const capture = useMemo(
    () =>
      createMeetupCapture({
        ocr: mlKitOcr,
        deleteFile: deleteCapturedPhoto,
        questStartedAt,
        submit: (text) => {
          if (practice) lastRead.current = text.replace(/\s+/g, ' ').trim();
          return submit(text);
        },
      }),
    [questStartedAt, submit, practice],
  );

  const onShot = async (uri: string) => {
    setBusy(true);
    lastRead.current = '';
    const out = await capture.check({ uri, takenAt: now() });
    setBusy(false);
    if (out.kind === 'passed') setStep({ kind: 'done', text: passText(out.minted, practice) });
    else setStep({ kind: 'camera', notice: noticeFor(out) });
  };

  if (step.kind === 'code') return <MeetupCodeCard code={code} onOpenCamera={() => setStep({ kind: 'camera', notice: null })} />;

  const readLine = practice && lastRead.current ? <Text style={{ color: t.textMuted, fontSize: font.body }}>Phone read: {lastRead.current}</Text> : null;

  if (step.kind === 'done') {
    return (
      <View style={{ gap: space.m }}>
        <Text style={{ color: t.text, fontSize: font.title, fontWeight: '600' }}>{step.text}</Text>
        {readLine}
        <Button primary title="Close" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.m }}>
      <MeetupCamera code={code} busy={busy} notice={step.notice} onShot={(uri) => void onShot(uri)} onRetake={() => setStep({ kind: 'camera', notice: null })} />
      {readLine}
    </View>
  );
}
