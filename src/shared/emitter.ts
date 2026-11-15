// OWNER: all three, written at hour 0. Tiny pub/sub used by fakes and real code alike.
import type { Unsub } from '../contracts';

export type Emitter<T> = {
  emit(value: T): void;
  on(fn: (value: T) => void): Unsub;
  size(): number;
};

export function createEmitter<T>(): Emitter<T> {
  const subs = new Set<(value: T) => void>();
  return {
    emit(value) {
      subs.forEach((fn) => fn(value));
    },
    on(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    size: () => subs.size,
  };
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
