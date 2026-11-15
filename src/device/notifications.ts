// OWNER: A (Spec A, task A10). Every notification in the product is decided and delivered here.
//
// Nobody calls A to notify. A subscribes to the other owners' events through the contract (see the
// "Events and notifications" table in docs/contract.md) and turns them into Notices. Copy follows the
// design: calm, specific, weather words, never "blocked" or "failed".
//
// Dedup: each notice fires once per trigger. Plan reminders and block warnings are remembered in the
// KeyValueStore so an app restart does not repeat them. Everything is driven by injected deps, so the
// tests (and the browser gallery) run with a fake Notifier and a fake clock.
import type { Clock, Ledger, Planner, PostureSource, PostureState, Posture, Quests, TaskType, Unsub } from '../contracts';
import { HOUR, MIN } from '../shared/emitter';
import type { BlockerPort, Notice, NoticeKind, Notifier } from './ports';
import { type KeyValueStore, KEY_PREFIX } from './storage';

export const UMBRELLA_LOW_MIN = 5;
export const BLOCK_WARNING_MS = 10 * MIN;
/** The day (and its reminders) resets at 04:00, matching the ledger. */
export const DAY_RESET_HOUR = 4;

export const dayKey = (now: number) => new Date(now - DAY_RESET_HOUR * HOUR).toISOString().slice(0, 10);

export const fmtClock = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** What each quest type is called in "quest done" notices. */
export const QUEST_LABEL: Record<TaskType, string> = {
  fitness: '2,000 steps',
  place: '45 minutes away from home',
  meetup: 'Meetup code',
  study: 'Quiz passed',
  coding: 'Commit made',
  focus: '25 minutes phone-down',
};

export const WEATHER_NAME: Record<Posture, string> = { open: 'Clear skies', metered: 'Cloudy', sealed: 'Storm' };

/** Body of the ongoing notification: when the weather next changes, and how much free time is left. */
export function persistentBody(s: Pick<PostureState, 'allowanceLeftMin' | 'nextChange'>): string {
  const next = s.nextChange ? `${s.nextChange.to === 'open' ? 'Clears' : 'Changes'} at ${fmtClock(s.nextChange.at)}. ` : '';
  const free =
    s.allowanceLeftMin <= 0 ? 'Free time is used up for today.' : `${Math.floor(s.allowanceLeftMin / 60)} h ${s.allowanceLeftMin % 60} m of free time left.`;
  return `${next}${free}`;
}

export type NotificationDeps = {
  clock: Pick<Clock, 'now' | 'onTick'>;
  posture: Pick<PostureSource, 'get' | 'subscribe'>;
  ledger: Pick<Ledger, 'balance' | 'onChange'>;
  planner: Pick<Planner, 'remindersDue' | 'nextBlock'>;
  quests: Pick<Quests, 'onVerified'>;
  notifier: Notifier;
  store: KeyValueStore;
  /** Optional: keeps the persistent foreground-service notification (weather + umbrella time) current. */
  blocker?: Pick<BlockerPort, 'setNotificationText'>;
};

export function createNotificationRouter(d: NotificationDeps) {
  let lastPosture: Posture | null = null;
  let lastAllowance: number | null = null;
  let umbrellaWasLow = false;

  const send = (kind: NoticeKind, title: string, body: string, actions?: string[]) =>
    void d.notifier.show({ kind, title, body, at: d.clock.now(), ...(actions ? { actions } : {}) } satisfies Notice);

  /** True the first time this (kind, key) is seen on this day; remembers it across restarts. */
  const firstTime = (kind: NoticeKind, key: string): boolean => {
    const storeKey = `${KEY_PREFIX}notice:${kind}:${key}`;
    if (d.store.get(storeKey)) return false;
    d.store.set(storeKey, '1');
    return true;
  };

  /** Persistent notification: always shows the weather and how much umbrella time is left. */
  const refreshPersistent = () => {
    const s = d.posture.get();
    d.blocker?.setNotificationText(`${WEATHER_NAME[s.posture]} · umbrella ${d.ledger.balance()} min`, persistentBody(s));
  };

  const onTick = () => {
    const now = d.clock.now();
    const today = dayKey(now);

    // Plan reminders: morning, then noon only if nothing is planned (Planner decides which is due).
    const due = d.planner.remindersDue(now);
    if (due === 'morning' && firstTime('plan_morning', today)) {
      send('plan_morning', 'Plan your day?', 'Two minutes now, smarter help later.', ['Plan', 'Not today']);
    }
    if (due === 'noon' && firstTime('plan_noon', today)) {
      send('plan_noon', 'Nothing planned yet — want to?', 'No pressure. The sky works either way.', ['Plan', 'Not today']);
    }

    // 10 minutes before a declared block begins.
    const next = d.planner.nextBlock(now);
    if (next && next.start - now <= BLOCK_WARNING_MS && next.start > now && firstTime('block_soon', String(next.start))) {
      // a wind-down brings clouds; blocks and sleep bring a storm
      const weather = next.type === 'wind_down' ? 'Cloudy' : 'Storm';
      send('block_soon', `Clouds at ${fmtClock(next.start)} — ${next.title}`, `${weather} until ${fmtClock(next.end)}. Umbrella time stays put for later.`);
    }
  };

  const onPosture = () => {
    const s = d.posture.get();

    if (lastPosture !== null && s.posture !== lastPosture) send('weather_change', `${WEATHER_NAME[s.posture]} now`, s.reason);
    lastPosture = s.posture;

    // Free time used: fires when the allowance first hits 0 (not at start-up with 0 already).
    if (lastAllowance !== null && lastAllowance > 0 && s.allowanceLeftMin <= 0) {
      send('free_time_used', "Free time's up — the forecast is live", 'Clouds can roll in until 04:00 when the pull gets strong.');
    }
    lastAllowance = s.allowanceLeftMin;

    refreshPersistent();
  };

  const onLedger = () => {
    const low = d.ledger.balance() < UMBRELLA_LOW_MIN;
    if (low && !umbrellaWasLow) {
      const m = d.ledger.balance();
      send('umbrella_low', 'Umbrella under 5 min', `${m} ${m === 1 ? 'minute' : 'minutes'} left on this one. Fold it whenever you like.`);
    }
    umbrellaWasLow = low; // re-arms once the balance recovers
    refreshPersistent();
  };

  return {
    /** Start listening. Returns one unsubscribe for everything. */
    start(): Unsub {
      // Seed "last seen" values so start-up never fires a change notice by itself.
      const s = d.posture.get();
      lastPosture = s.posture;
      lastAllowance = s.allowanceLeftMin;
      umbrellaWasLow = d.ledger.balance() < UMBRELLA_LOW_MIN;
      refreshPersistent();

      const subs = [
        d.clock.onTick(onTick),
        d.posture.subscribe(onPosture),
        d.ledger.onChange(onLedger),
        d.quests.onVerified((q, v, minted) => {
          if (!v.pass) return;
          send('quest_verified', `${QUEST_LABEL[q.type]} — ${minted} minutes of umbrella time`, `Umbrella time: ${d.ledger.balance()} min.`);
        }),
      ];
      return () => subs.forEach((u) => u());
    },
    /** Run the clock-driven checks now (tests and the runtime's first run). */
    check: onTick,
  };
}

export type NotificationRouter = ReturnType<typeof createNotificationRouter>;
