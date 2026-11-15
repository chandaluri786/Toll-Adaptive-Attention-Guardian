// OWNER: A (Spec A). The real device, assembled for a phone. Loaded lazily from ../index.ts only when
// USE_REAL is true, so Jest and the browser preview never import native modules.
//
// !! NOT VERIFIED ON A PHONE !!  Integration step 2 (docs/contract.md): A flips USE_REAL after A2, A3 and
// A9 work on the demo phone.
import type { Debug, GetServices } from '../../contracts';
import { createDeviceKit } from '../kit';
import { createUsageMeter } from '../usageMeter';
import { configureOverlay, createNativeBlocker } from './appBlocker';
import { createNativeInstalledApps, createNativeNotifier, createNativePermissions } from './ports';
import { createNativeSignals } from './signals';
import { createDeviceStore } from '../storage';

export function createRealDevice(get: GetServices) {
  const blocker = createNativeBlocker();
  configureOverlay();

  // The usage feed is derived from the blocker's unlock budget (see usageMeter.ts).
  const meter = createUsageMeter(blocker, () => get().clock.now());

  const kit = createDeviceKit(
    {
      blocker,
      permissions: createNativePermissions(),
      installedApps: createNativeInstalledApps(),
      notifier: createNativeNotifier(),
      store: createDeviceStore(),
      meter,
    },
    get,
  );

  // Real hardware has nothing to reset or seed; the demo panel still calls these safely.
  const debug: Debug = { reset: () => undefined, seed: () => undefined };

  return {
    services: { usageFeed: meter.feed, deviceSignals: createNativeSignals(get) },
    debug,
    kit,
  };
}
