// OWNER: C (Spec C — task C7). Weather thresholds (design 7.3), shown on purpose so they can be
// changed live on stage, with the Focus Pressure explainer. An edit goes through weatherConfig's
// setter; the engine applies it on its next reading. Logic lives in ../thresholds.ts.
import React, { useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { debug } from '../../services';
import { usePosture } from '../../shared/hooks';
import { useTheme } from '../../ui/components';
import { Body, Card } from '../../ui/primitives';
import { fonts, space } from '../../ui/theme';
import { FREE_TIME_MIN } from '../freeTime';
import { applyStep, COPY, ECONOMY_ROWS, formatDuration, pressureMeter, weatherStoreOr, type ThresholdField } from '../thresholds';
import type { WeatherConfig } from '../weatherConfig';
import { Divider, Row, Stepper } from './parts';

const BAR_HEIGHT = 8;
const MARK_HEIGHT = 18;
const UMBRELLA_CHUNK_MIN = 15;
const SCORE_SIZE = 40;
// Rows sit flush inside the card; the rows carry their own vertical padding.
const ROW_CARD = { paddingVertical: space.xs, gap: 0 };

function PressureCard({ config }: { config: WeatherConfig }) {
  const t = useTheme();
  const { score } = usePosture();
  const m = pressureMeter(score, config);
  const mark = (pct: number) => (
    <View style={{ position: 'absolute', left: `${pct}%`, top: (BAR_HEIGHT - MARK_HEIGHT) / 2, width: 2, height: MARK_HEIGHT, backgroundColor: t.text }} />
  );
  return (
    <Card>
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>{COPY.pressureNow}</Body>
          <Text style={{ color: t.text, fontSize: SCORE_SIZE, lineHeight: SCORE_SIZE * 1.05, fontFamily: fonts.display }} accessibilityLabel={`Focus Pressure ${m.score}`}>
            {m.score}
          </Text>
        </View>
        <View style={{ height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: t.track }}>
          <View style={{ width: `${m.fillPct}%`, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, backgroundColor: t.cloud }} />
          {mark(m.cloudyPct)}
          {mark(m.stormPct)}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body muted small>0</Body>
          <Body muted small>Cloudy at {config.cloudyAt}</Body>
          <Body muted small>Storm at {config.stormAt}</Body>
          <Body muted small>100</Body>
        </View>
        <Body muted small>{COPY.explainer}</Body>
      </View>
    </Card>
  );
}

export default function EngineSection() {
  const { store, isPractice } = weatherStoreOr(debug.engine.weather);
  const config = useSyncExternalStore(store.subscribe, store.get);
  const [note, setNote] = useState<string | null>(null);
  const step = (field: ThresholdField, delta: number) => {
    const r = applyStep(store, field, delta);
    setNote(r.ok ? COPY.nextReading : r.error);
  };

  return (
    <View style={{ gap: space.m }}>
      <Body muted>{COPY.intro}</Body>
      <PressureCard config={config} />
      <Card style={ROW_CARD}>
        <Row
          title="Cloudy when pressure reaches"
          subtitle="After free time runs out"
          right={<Stepper label="Cloudy line" value={String(config.cloudyAt)} onMinus={() => step('cloudyAt', -1)} onPlus={() => step('cloudyAt', 1)} />}
        />
        <Divider />
        <Row
          title="Storm when pressure reaches"
          subtitle="Inside your declared blocks"
          right={<Stepper label="Storm line" value={String(config.stormAt)} onMinus={() => step('stormAt', -1)} onPlus={() => step('stormAt', 1)} />}
        />
        <Divider />
        <Row title="Free time a day" subtitle="Only your blocks change the sky until it runs out" right={formatDuration(FREE_TIME_MIN)} />
        <Divider />
        <Row title="Umbrella opens in chunks of" subtitle="Cloudy only" right={`${UMBRELLA_CHUNK_MIN} min`} />
        <Divider />
        <Row title="Storm" subtitle="Inside your declared blocks" right="Blocks only" />
        <Divider />
        <Row title="Umbrella cost" subtitle="Earned minutes" right="1 min = 1 min" />
        <Divider />
        {ECONOMY_ROWS.map((row) => (
          <React.Fragment key={row.title}>
            <Row title={row.title} subtitle={row.subtitle} right={row.right} />
            <Divider />
          </React.Fragment>
        ))}
        <Row title="New day" subtitle="Free time comes back" right="04:00" />
      </Card>
      {note ? <Body muted small>{note}</Body> : null}
      {isPractice ? <Body muted small>Practice copy: the sky follows the demo panel until the forecast engine is switched on.</Body> : null}
    </View>
  );
}
