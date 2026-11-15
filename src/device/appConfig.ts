// OWNER: A (Spec A, task A8). Which apps are distracting, which two messaging apps stay open, and
// the 12-hour removal delay.
//
// The delay is the product's commitment device (planning doc, "Restriction tiers"): adding an app
// to the distracting list takes effect immediately, removing one takes effect only 12 hours later.
// That closes the "I'll just unblock Instagram for a second" loophole without ever locking the user
// out of their phone. Time always comes from the injected `now` (Clock.now()), never Date.now(), so
// the demo panel can fast-forward it.
import { HOUR, createEmitter } from '../shared/emitter';
import type { Unsub } from '../contracts';
import { MAX_MESSAGING_APPS, type AppClassification } from './policy';
import { type KeyValueStore, KEY_PREFIX, readJson, writeJson } from './storage';

export const REMOVAL_DELAY_MS = 12 * HOUR;

const KEY = `${KEY_PREFIX}appConfig`;

type Persisted = {
  restricted: string[];
  alwaysOpen: string[];
  /** package → timestamp at which its removal takes effect */
  pendingRemovals: Record<string, number>;
};

export type RemovalStatus = { pkg: string; effectiveAt: number };

export type AppConfig = ReturnType<typeof createAppConfig>;

export function createAppConfig(store: KeyValueStore, now: () => number) {
  const changes = createEmitter<void>();
  let data: Persisted = readJson<Persisted>(store, KEY, { restricted: [], alwaysOpen: [], pendingRemovals: {} });

  const save = () => {
    writeJson(store, KEY, data);
    changes.emit();
  };

  /** Apply any removals whose 12 hours have passed. Called before every read, so it needs no timer. */
  const settle = () => {
    const t = now();
    const due = Object.entries(data.pendingRemovals).filter(([, at]) => at <= t);
    if (due.length === 0) return;
    const dueSet = new Set(due.map(([pkg]) => pkg));
    const rest = { ...data.pendingRemovals };
    dueSet.forEach((pkg) => delete rest[pkg]);
    data = { ...data, restricted: data.restricted.filter((p) => !dueSet.has(p)), pendingRemovals: rest };
    save();
  };

  return {
    /** Adding is instant. Re-adding an app also cancels its pending removal. */
    addRestricted(pkg: string) {
      settle();
      const { [pkg]: _cancelled, ...rest } = data.pendingRemovals;
      data = {
        ...data,
        restricted: data.restricted.includes(pkg) ? data.restricted : [...data.restricted, pkg],
        alwaysOpen: data.alwaysOpen.filter((p) => p !== pkg), // an app is never both
        pendingRemovals: rest,
      };
      save();
    },

    /** Removing takes 12 hours. Returns when it will take effect. Asking twice does not extend it. */
    requestRemoval(pkg: string): RemovalStatus | null {
      settle();
      if (!data.restricted.includes(pkg)) return null;
      const effectiveAt = data.pendingRemovals[pkg] ?? now() + REMOVAL_DELAY_MS;
      data = { ...data, pendingRemovals: { ...data.pendingRemovals, [pkg]: effectiveAt } };
      save();
      return { pkg, effectiveAt };
    },

    cancelRemoval(pkg: string) {
      settle();
      const { [pkg]: _cancelled, ...rest } = data.pendingRemovals;
      data = { ...data, pendingRemovals: rest };
      save();
    },

    /**
     * Pick the always-open messaging apps. Capped at two; extra picks are ignored so the cap holds
     * no matter what the UI sends. Returns the list actually saved.
     */
    setAlwaysOpen(pkgs: string[]): string[] {
      settle();
      const picked = [...new Set(pkgs)].filter((p) => !data.restricted.includes(p)).slice(0, MAX_MESSAGING_APPS);
      data = { ...data, alwaysOpen: picked };
      save();
      return picked;
    },

    restricted(): string[] {
      settle();
      return data.restricted;
    },
    alwaysOpen(): string[] {
      settle();
      return data.alwaysOpen;
    },
    pendingRemovals(): RemovalStatus[] {
      settle();
      return Object.entries(data.pendingRemovals).map(([pkg, effectiveAt]) => ({ pkg, effectiveAt }));
    },

    /** The shape policy.ts needs to classify any package. */
    classification(): AppClassification {
      settle();
      return {
        restricted: new Set(data.restricted),
        alwaysOpen: new Set(data.alwaysOpen),
        discretionary: new Set(),
      };
    },

    onChange(fn: () => void): Unsub {
      return changes.on(() => fn());
    },
  };
}
