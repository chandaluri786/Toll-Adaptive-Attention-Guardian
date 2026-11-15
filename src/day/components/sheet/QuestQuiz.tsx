// OWNER: B (task B10). Quest sheet — the study quiz, in the in-progress layout of 3.2–3.4: title +
// "In progress", the topic, a 90-second bar, one question at a time with four answer buttons, what
// it pays, Stop quest. Submits after the third answer or when the clock runs out.
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { ChoiceButton } from '../../../ui/primitives';
import { fonts, space, type as font } from '../../../ui/theme';
import { useNow } from '../../hooks';
import type { QuizRound } from '../../quiz-bank';
import { answerAt, quizOver, quizView, submission } from '../../quiz-sheet';
import { Bar, StatusPill, TextLink } from './SheetParts';

type Props = { round: QuizRound | null; pay: number; onSubmit: (answers: number[]) => void; onStop: () => void };

const TICK_MS = 250;

export function QuestQuiz({ round, pay, onSubmit, onStop }: Props) {
  const t = useTheme();
  const [answers, setAnswers] = useState<number[]>([]);
  const sent = useRef(false);
  const now = useNow(TICK_MS, round !== null);
  const roundStart = round?.startedAt ?? null;

  useEffect(() => {
    setAnswers([]);
    sent.current = false;
  }, [roundStart]);

  useEffect(() => {
    if (!round || sent.current || !quizOver(round, answers, now)) return;
    sent.current = true;
    onSubmit(submission(answers));
  }, [round, answers, now, onSubmit]);

  if (!round) {
    return (
      <View style={{ gap: space.m }}>
        <Text style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>The quiz questions aren't on this phone. Phone-down focus still counts for this task.</Text>
        <TextLink title="Stop quest" onPress={onStop} />
      </View>
    );
  }

  const v = quizView(round, answers, now, pay);
  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
        <Text style={{ color: t.text, fontSize: font.title, fontFamily: fonts.medium, flexShrink: 1 }}>{v.title}</Text>
        <StatusPill label="In progress" />
      </View>
      <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{v.topic}</Text>
      <View style={{ gap: space.xs + 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{v.counter}</Text>
          <Text accessibilityLabel={`${v.timeLeft} left`} style={{ color: t.text, fontSize: font.body, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
            {v.timeLeft}
          </Text>
        </View>
        <Bar fraction={v.fraction} />
      </View>
      {v.question && (
        <>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: font.body + 2, fontFamily: fonts.medium }}>
            {v.question.q}
          </Text>
          {v.question.options.map((option, i) => (
            <ChoiceButton key={`${answers.length}-${i}`} title={option} onPress={() => !sent.current && setAnswers((a) => answerAt(a, i))} />
          ))}
        </>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
        <Icon name="umbrella" size={18} color={t.goldText} />
        <Text style={{ color: t.goldText, fontSize: font.body, fontFamily: fonts.medium }}>{v.pays}</Text>
      </View>
      <TextLink title="Stop quest" onPress={onStop} />
    </View>
  );
}
