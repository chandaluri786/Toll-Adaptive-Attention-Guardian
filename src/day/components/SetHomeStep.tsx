// OWNER: B (Spec B — task B1). Step 3 of A's onboarding (design 6.3). A's OnboardingView draws the
// title, the "stays on your phone" line and the footer button; this slot is the home picker itself.
// Skipping is always fine: home can be set later in Settings.
import React from 'react';
import HomePicker from './HomePicker';

export default function SetHomeStep() {
  return <HomePicker />;
}
