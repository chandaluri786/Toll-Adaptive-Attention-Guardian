// OWNER: A (Spec A — tasks A2, A3, A8). Thin wrapper around expo-app-blocker (pinned 0.1.78).
//
// How the blocker works on Android (from its README):
// - A foreground service polls UsageStatsManager and flashes a system overlay over blocked apps.
// - It then opens THIS app with a deep link: toll://blocked?app=<Name>&package=<pkg>&reason=opened|expired
//   which expo-router sends to src/app/blocked.tsx (the Storm screen).
// - Permissions: openUsageStatsSettings() and openOverlaySettings() deep-link to system settings
//   with no callback, so onboarding polls on resume (task A7).
//
// Only import this from real (USE_REAL) code paths: it needs a dev build, not Expo Go or Jest.
//
// RISK for hour 3: the blocker's service is declared foregroundServiceType="specialUse". The plan
// assumed location sampling could share it as type "location". Check how background location will
// run (expo-location's own foreground service is the likely route) before relying on B6.

export {
  getInstalledApps,
  getBlockedApps,
  setBlockedApps,
  startMonitoring,
  stopMonitoring,
  openOverlaySettings,
  openUsageStatsSettings,
} from 'expo-app-blocker';
