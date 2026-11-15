// OWNER: C (Spec C — task C6). Not optional: a real weather change takes ~3.5 min, longer than the
// demo slot. Forces the clock (time and speed), weather, free time and steps; seeds every folder
// at once; resets everything. Works on fakes and on the real engine: optional controls are
// feature-detected in ../demo.ts, which holds all the logic.
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { debug } from '../../services';
import { useBalance, usePosture } from '../../shared/hooks';
import { Button, useTheme, WeatherChip } from '../../ui/components';
import { Body, Card, Display, Segmented } from '../../ui/primitives';
import { space } from '../../ui/theme';
import { weatherFor } from '../../ui/weather';
import type { Posture, Seed } from '../../contracts';
import {
  advance,
  applySeed,
  atLocalTime,
  capabilitiesOf,
  DEMO_UMBRELLA_MIN,
  forceWeather,
  FULL_FREE_TIME_MIN,
  quickOpens,
  resetEverything,
  setFreeTimeLeft,
  SPEEDS,
} from '../demo';
import { formatHm } from '../time';
import { Choice, Choices } from './parts';

const REFRESH_MS = 1000;
const WEATHERS: Posture[] = ['open', 'metered', 'sealed'];
const SEEDS: { seed: Seed; label: string }[] = [
  { seed: 'demo_2pm', label: '2pm lecture (the demo)' },
  { seed: 'late_night', label: 'Late night' },
  { seed: 'no_plan', label: 'No plan today' },
];

/** Re-render every second so the clock readout follows a sped-up clock. */
function useClockNow(): number {
  const { clock } = debug.engine;
  const [now, setNow] = useState(clock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), REFRESH_MS);
    const unsub = clock.onTick((t) => setNow(t));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [clock]);
  return now;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <View style={{ gap: space.s }}>
        <Body>{title}</Body>
        {children}
      </View>
    </Card>
  );
}

export default function DemoPanel() {
  const t = useTheme();
  const now = useClockNow();
  const state = usePosture();
  const balance = useBalance();
  const caps = capabilitiesOf(debug);
  const { clock } = debug.engine;
  const [speed, setSpeed] = useState(clock.speed());
  const [scrolling, setScrolling] = useState(false);
  const refresh = () => {
    setSpeed(clock.speed());
    setScrolling(false);
  };
  const changeSpeed = (x: number) => {
    clock.setSpeed(x);
    setSpeed(clock.speed());
  };
  const toggleScrolling = () => {
    debug.device.simulateScrolling?.(!scrolling);
    setScrolling(!scrolling);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: space.m, paddingTop: space.xl, gap: space.m }}>
      <Display>Demo panel</Display>
      <Card>
        <View style={{ gap: space.xs }}>
          <WeatherChip posture={state.posture} />
          <Body>
            {formatHm(now)} · {speed}× · Focus Pressure {state.score}
            {state.grace ? ' · clouds gathering' : ''}
          </Body>
          <Body muted small>
            Free time left {state.allowanceLeftMin} min · Umbrella time {balance} min
          </Body>
        </View>
      </Card>

      <Section title="Time">
        <Segmented
          options={SPEEDS.map((x) => ({ id: String(x), label: `${x}×` }))}
          value={String(speed)}
          onChange={(id) => changeSpeed(Number(id))}
        />
        <Body muted small>At 60× a 3½-minute weather change takes about 4 seconds.</Body>
        <Choices>
          <Choice label="+15 min" onPress={() => advance(clock, 15)} />
          <Choice label="+1 hour" onPress={() => advance(clock, 60)} />
          <Choice label="14:00" onPress={() => clock.setNow(atLocalTime(clock.now(), 14 * 60))} />
          <Choice label="Check the sky now" onPress={() => clock.tick()} />
        </Choices>
      </Section>

      <Section title="Weather">
        <Choices>
          {WEATHERS.map((p) => (
            <Choice key={p} label={weatherFor(p).name} selected={state.posture === p} onPress={() => forceWeather(debug, p)} />
          ))}
          {caps.canRelease ? <Choice label="Back to the forecast" onPress={() => forceWeather(debug, null)} /> : null}
        </Choices>
        <Choice
          label={state.grace ? 'Clouds gathering: on' : 'Clouds gathering: off'}
          selected={state.grace}
          onPress={() => debug.engine.postureSource.setGrace(!state.grace)}
        />
      </Section>

      <Section title="Free time and phone use">
        <Choices>
          <Choice label="Use up free time" onPress={() => setFreeTimeLeft(debug, 0)} />
          <Choice label="−30 min" onPress={() => setFreeTimeLeft(debug, state.allowanceLeftMin - 30)} />
          <Choice label="Full day" onPress={() => setFreeTimeLeft(debug, FULL_FREE_TIME_MIN)} />
        </Choices>
        <Choices>
          {caps.canScroll ? <Choice label={scrolling ? 'Stop scrolling' : 'Start scrolling'} selected={scrolling} onPress={toggleScrolling} /> : null}
          {caps.canQuickOpen ? <Choice label="5 quick opens" onPress={() => quickOpens(debug)} /> : null}
        </Choices>
      </Section>

      <Section title="Steps and umbrella time">
        <Choices>
          <Choice label="+500 steps" onPress={() => debug.day.addSteps(500)} />
          <Choice label="+2,000 steps" onPress={() => debug.day.addSteps(2000)} />
          <Choice label={`Umbrella ${DEMO_UMBRELLA_MIN} min`} onPress={() => debug.ledger.setBalance(DEMO_UMBRELLA_MIN)} />
        </Choices>
      </Section>

      <Section title="Start from">
        {SEEDS.map(({ seed, label }) => (
          <Button
            key={seed}
            title={label}
            onPress={() => {
              applySeed(debug, seed);
              refresh();
            }}
          />
        ))}
        <Button
          primary
          title="Reset everything"
          onPress={() => {
            resetEverything(debug);
            refresh();
          }}
        />
      </Section>
    </ScrollView>
  );
}
