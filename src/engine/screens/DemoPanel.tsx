// OWNER: C (Spec C — task C6). Not optional: a real weather change takes ~3.5 min, longer than the
// demo slot. Forces the clock, weather, free time and steps; seeds every folder at once.
import React from 'react';
import { Text } from 'react-native';
import { debug } from '../../services';
import type { Seed } from '../../contracts';
import { Button, Placeholder, useTheme } from '../../ui/components';
import { HOUR } from '../../shared/emitter';

const seedAll = (s: Seed) => {
  debug.engine.seed(s);
  debug.ledger.seed(s);
  debug.device.seed(s);
  debug.day.seed(s);
};

export default function DemoPanel() {
  const t = useTheme();
  const ps = debug.engine.postureSource;
  return (
    <Placeholder title="Demo panel" owner="C" tasks="C6">
      <Text style={{ color: t.textMuted }}>Drives the fakes now; drives the real engine after integration.</Text>
      <Button title="Clear skies" onPress={() => ps.setPosture('open')} />
      <Button title="Cloudy" onPress={() => ps.setPosture('metered')} />
      <Button title="Storm" onPress={() => ps.setPosture('sealed')} />
      <Button title="Clouds gathering (grace) on/off" onPress={() => ps.setGrace(!ps.get().grace)} />
      <Button title="Use up free time" onPress={() => ps.setAllowance(0)} />
      <Button title="Clock +1 hour" onPress={() => debug.engine.clock.setNow(debug.engine.clock.now() + HOUR)} />
      <Button title="Add 2,000 steps" onPress={() => debug.day.addSteps(2000)} />
      <Button title="Seed: 2pm lecture (demo)" onPress={() => seedAll('demo_2pm')} />
      <Button title="Seed: late night" onPress={() => seedAll('late_night')} />
      <Button title="Seed: no plan" onPress={() => seedAll('no_plan')} />
      <Button title="Reset everything" onPress={() => seedAll('fresh')} />
    </Placeholder>
  );
}
