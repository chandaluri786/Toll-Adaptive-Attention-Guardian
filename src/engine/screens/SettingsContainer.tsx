// OWNER: C (Spec C — task C7). Hosts each owner's section; owners edit only their own section file.
import React from 'react';
import { router } from 'expo-router';
import RestrictedAppsSection from '../../device/screens/RestrictedAppsSection';
import PlannerSection from '../../day/components/PlannerSection';
import EngineSection from './EngineSection';
import { Button, Placeholder } from '../../ui/components';

export default function SettingsContainer() {
  return (
    <Placeholder title="Settings" owner="C" tasks="C7">
      <RestrictedAppsSection />
      <PlannerSection />
      <EngineSection />
      <Button title="Onboarding (A)" onPress={() => router.push('/onboarding')} />
      <Button title="Storm screen (A)" onPress={() => router.push('/blocked?app=Instagram&reason=opened')} />
      <Button title="Demo panel (C)" onPress={() => router.push('/demo')} />
    </Placeholder>
  );
}
