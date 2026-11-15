// OWNER: C (Spec C — task C7). Settings (design 7.1): hosts each owner's section; owners edit only
// their own section file. Rows open their section in place (no new routes: src/app is shared).
import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import RestrictedAppsSection from '../../device/screens/RestrictedAppsSection';
import PlannerSection from '../../day/components/PlannerSection';
import { debug } from '../../services';
import { useTheme } from '../../ui/components';
import { Body, Card, Display } from '../../ui/primitives';
import { space } from '../../ui/theme';
import { FREE_TIME_MIN } from '../freeTime';
import { COPY, thresholdSummary, weatherStoreOr } from '../thresholds';
import EngineSection from './EngineSection';
import { Divider, DisclosureRow } from './parts';

// Rows sit flush inside the card; the rows carry their own vertical padding.
const ROW_CARD = { paddingVertical: space.xs, gap: 0 };

type SectionId = 'apps' | 'planner' | 'weather' | 'demo';

const ALWAYS_AVAILABLE =
  'Removing a distracting app takes 12 hours. Calls, SMS, maps, banking, health, camera, clock and settings are always available.';

export default function SettingsContainer() {
  const t = useTheme();
  const [expanded, setExpanded] = useState<SectionId | null>(null);
  const toggle = (id: SectionId) => setExpanded((cur) => (cur === id ? null : id));
  const { store } = weatherStoreOr(debug.engine.weather);
  const config = useSyncExternalStore(store.subscribe, store.get);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.m + 2, paddingTop: space.xl, gap: space.m - 2 }}>
      <Display>Settings</Display>

      <Card style={ROW_CARD}>
        <DisclosureRow
          icon="smartphone"
          title="Distracting apps"
          subtitle="And up to 2 messaging apps that never cloud over"
          open={expanded === 'apps'}
          onToggle={() => toggle('apps')}
        />
        {expanded === 'apps' ? <View style={{ paddingBottom: space.m }}><RestrictedAppsSection /></View> : null}
      </Card>
      <View style={{ paddingHorizontal: space.xs }}>
        <Body muted small>{ALWAYS_AVAILABLE}</Body>
      </View>

      <Card style={ROW_CARD}>
        <DisclosureRow
          icon="house"
          title="Home, sleep window and timetable"
          subtitle="Your blocks are the only place a storm can form"
          open={expanded === 'planner'}
          onToggle={() => toggle('planner')}
        />
        {expanded === 'planner' ? <View style={{ paddingBottom: space.m }}><PlannerSection /></View> : null}
      </Card>

      <Card style={ROW_CARD}>
        <DisclosureRow
          icon="cloud"
          title={COPY.title}
          subtitle={thresholdSummary(config, FREE_TIME_MIN)}
          open={expanded === 'weather'}
          onToggle={() => toggle('weather')}
        />
        {expanded === 'weather' ? <View style={{ paddingBottom: space.m }}><EngineSection /></View> : null}
      </Card>

      <Card style={ROW_CARD}>
        <DisclosureRow icon="sparkles" title="For the demo" subtitle="Demo panel and screen previews" open={expanded === 'demo'} onToggle={() => toggle('demo')} />
        {expanded === 'demo' ? (
          <View>
            <Divider />
            <DisclosureRow title="Demo panel" open={false} onToggle={() => router.push('/demo')} />
            <Divider />
            <DisclosureRow title="Onboarding" open={false} onToggle={() => router.push('/onboarding')} />
            <Divider />
            <DisclosureRow title="Storm screen" open={false} onToggle={() => router.push('/blocked?app=Instagram&reason=opened')} />
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}
