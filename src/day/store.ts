// OWNER: B. The one persisted planner store on the phone (react-native-mmkv, keys under `day:`),
// shared by B's screens now and by the real Planner after the integration flip.
// Only screens and src/day/index.ts import this file; pure logic and tests use ./kv instead.
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';
import services from '../services';
import { DAY_PREFIX, type KV } from './kv';
import { createPlannerStore, type PlannerState, type PlannerStore } from './planner';

function createMMKVKV(): KV {
  const mmkv = createMMKV({ id: 'toll' });
  return {
    getString: (key) => mmkv.getString(DAY_PREFIX + key),
    set: (key, value) => mmkv.set(DAY_PREFIX + key, value),
    remove: (key) => {
      mmkv.remove(DAY_PREFIX + key);
    },
    keys: () => mmkv.getAllKeys().filter((k) => k.startsWith(DAY_PREFIX)),
  };
}

let plannerStore: PlannerStore | null = null;

/** Created on first use; time always comes from the shared Clock so the demo panel can move it. */
export function getPlannerStore(): PlannerStore {
  if (!plannerStore) plannerStore = createPlannerStore({ kv: createMMKVKV(), now: () => services.clock.now() });
  return plannerStore;
}

export function usePlannerState(): PlannerState {
  const store = getPlannerStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
