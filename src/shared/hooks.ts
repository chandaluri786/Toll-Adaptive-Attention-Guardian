// OWNER: all three, written at hour 0. React hooks so screens read services without knowing
// whether they are real or fake.
import { useSyncExternalStore } from 'react';
import services from '../services';
import type { PostureState } from '../contracts';

export function usePosture(): PostureState {
  return useSyncExternalStore(
    (cb) => services.postureSource.subscribe(cb),
    () => services.postureSource.get(),
  );
}

export function useBalance(): number {
  return useSyncExternalStore(
    (cb) => services.ledger.onChange(cb),
    () => services.ledger.balance(),
  );
}
