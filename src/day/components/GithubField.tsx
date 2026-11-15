// OWNER: B (Spec B — task B11, P1). Settings → Planner: the GitHub username or owner/repo that
// coding quests watch. Only this name is sent, only to GitHub's public API; no token, no sign-in.
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, useTheme } from '../../ui/components';
import { fonts, space, type as font } from '../../ui/theme';
import { getPlannerStore, usePlannerState } from '../store';
import { TextLink } from './sheet/SheetParts';
import { Field } from './fields';

const PRIVACY = 'Coding quests check your public commit count every 5 minutes. Only this name goes to GitHub — no sign-in, no token.';

export default function GithubField() {
  const t = useTheme();
  const { github } = usePlannerState();
  const [draft, setDraft] = useState(github ?? '');
  const [note, setNote] = useState<string | null>(null);

  const save = () => {
    const r = getPlannerStore().setGithub(draft);
    if (!r.ok) {
      setNote(r.error);
      return;
    }
    setDraft(getPlannerStore().getState().github ?? '');
    setNote('Saved. A repo (owner/repo) shows new commits fastest.');
  };
  const remove = () => {
    getPlannerStore().clearGithub();
    setDraft('');
    setNote('Removed. Coding quests wait until you add one.');
  };

  return (
    <View style={{ gap: space.s }}>
      <Field label="Username or owner/repo" value={draft} onChangeText={setDraft} placeholder="octocat or octocat/project" />
      <Text style={{ color: t.muted, fontSize: font.body, fontFamily: fonts.body }}>{PRIVACY}</Text>
      <Button primary title={github ? 'Update GitHub' : 'Save GitHub'} onPress={save} />
      {github && <TextLink title={`Stop watching ${github}`} onPress={remove} />}
      {!!note && (
        <Text accessibilityLiveRegion="polite" style={{ color: t.text, fontSize: font.body, fontFamily: fonts.body }}>
          {note}
        </Text>
      )}
    </View>
  );
}
