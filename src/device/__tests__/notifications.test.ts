// OWNER: A (task A10). Each notification fires once, for the right trigger, in the design's words.
import type { Block, PostureState, Quest, Verdict } from '../../contracts';
import { HOUR, MIN, createEmitter } from '../../shared/emitter';
import { createFakeBlocker, createFakeNotifier } from '../fakePorts';
import { createNotificationRouter, dayKey, fmtClock } from '../notifications';
import { createMemoryStore } from '../storage';

const at = (h: number, m = 0) => {
  const d = new Date(2026, 10, 16, h, m, 0, 0); // a Monday, local time
  return d.getTime();
};

function setup(startAt = at(8)) {
  let now = startAt;
  let state: PostureState = { posture: 'open', score: 0, reason: "Sky's clear.", reasonCode: 'none', nextChange: null, grace: false, allowanceLeftMin: 120, computedAt: 1 };
  let balance = 30;
  let reminder: 'morning' | 'noon' | null = null;
  let next: Block | null = null;
  const ticks = createEmitter<number>();
  const posture = createEmitter<void>();
  const ledger = createEmitter<void>();
  const verified = createEmitter<{ q: Quest; v: Verdict; m: number }>();
  const notifier = createFakeNotifier();
  const blocker = createFakeBlocker();
  const store = createMemoryStore();

  const router = createNotificationRouter({
    clock: { now: () => now, onTick: (fn) => ticks.on(fn) },
    posture: { get: () => state, subscribe: (fn) => posture.on(() => fn(state)) },
    ledger: { balance: () => balance, onChange: (fn) => ledger.on(() => fn()) },
    planner: { remindersDue: () => reminder, nextBlock: () => next },
    quests: { onVerified: (fn) => verified.on(({ q, v, m }) => fn(q, v, m)) },
    notifier,
    store,
    blocker,
  });
  router.start();

  return {
    notifier,
    blocker,
    tick: () => ticks.emit(now),
    setNow: (t: number) => (now = t),
    setReminder: (r: typeof reminder) => (reminder = r),
    setNext: (b: Block | null) => (next = b),
    setPosture: (patch: Partial<PostureState>) => {
      state = { ...state, ...patch };
      posture.emit();
    },
    setBalance: (b: number) => {
      balance = b;
      ledger.emit();
    },
    verify: (q: Partial<Quest>, v: Partial<Verdict>, minted: number) =>
      verified.emit({ q: q as Quest, v: v as Verdict, m: minted }),
    kinds: () => notifier.log.map((n) => n.kind),
  };
}

describe('plan reminders', () => {
  it('morning reminder fires once a day, even across many ticks', () => {
    const t = setup();
    t.setReminder('morning');
    t.tick();
    t.tick();
    t.tick();
    expect(t.kinds()).toEqual(['plan_morning']);
    expect(t.notifier.log[0]).toMatchObject({ title: 'Plan your day?', body: 'Two minutes now, smarter help later.', actions: ['Plan', 'Not today'] });
  });

  it('noon follow-up fires once, only when the planner says nothing is planned', () => {
    const t = setup(at(12));
    t.setReminder(null);
    t.tick();
    expect(t.kinds()).toEqual([]);
    t.setReminder('noon');
    t.tick();
    t.tick();
    expect(t.kinds()).toEqual(['plan_noon']);
    expect(t.notifier.log[0]).toMatchObject({ title: 'Nothing planned yet \u2014 want to?', body: 'No pressure. The sky works either way.' });
  });

  it('the next day gets its own reminder (the day resets at 04:00)', () => {
    const t = setup();
    t.setReminder('morning');
    t.tick();
    t.setNow(at(8) + 24 * HOUR);
    t.tick();
    expect(t.kinds()).toEqual(['plan_morning', 'plan_morning']);
  });

  it('dayKey rolls over at 04:00, not midnight', () => {
    expect(dayKey(at(3, 59))).not.toBe(dayKey(at(4, 0)));
    expect(dayKey(at(0, 30))).toBe(dayKey(at(3, 30)));
  });

  it('dayKey is the LOCAL date, whatever the time zone', () => {
    expect(dayKey(at(12))).toBe('2026-11-16');
    expect(dayKey(at(3, 59))).toBe('2026-11-15');
  });
});

describe('block warning', () => {
  const block: Block = { type: 'class', title: 'Algorithms', start: at(10), end: at(11) };

  it('fires 10 minutes before a block, once, in the design copy', () => {
    const t = setup(at(9, 49));
    t.setNext(block);
    t.tick();
    expect(t.kinds()).toEqual([]); // 11 minutes away
    t.setNow(at(9, 50));
    t.tick();
    t.tick();
    expect(t.kinds()).toEqual(['block_soon']);
    expect(t.notifier.log[0]).toMatchObject({ title: 'Clouds at 10:00 — Algorithms', body: 'Storm until 11:00. Umbrella time stays put for later.' });
  });

  it('does not fire for a block that has already started', () => {
    const t = setup(at(10, 5));
    t.setNext({ ...block, start: at(10) });
    t.tick();
    expect(t.kinds()).toEqual([]);
  });
});

describe('weather and free time', () => {
  it('announces a weather change with the reason, but not at start-up', () => {
    const t = setup();
    expect(t.kinds()).toEqual([]);
    t.setPosture({ posture: 'sealed', reason: "Storm until 11:00 — you're in Algorithms." });
    expect(t.notifier.log[0]).toMatchObject({ kind: 'weather_change', title: 'Storm now', body: "Storm until 11:00 — you're in Algorithms." });
  });

  it('does not repeat when the weather stays the same', () => {
    const t = setup();
    t.setPosture({ reason: 'still fine', computedAt: 2 });
    t.setPosture({ reason: 'still fine', computedAt: 3 });
    expect(t.kinds()).toEqual([]);
  });

  it('says free time is up exactly once, when it first reaches 0', () => {
    const t = setup();
    t.setPosture({ allowanceLeftMin: 10 });
    t.setPosture({ allowanceLeftMin: 0 });
    t.setPosture({ allowanceLeftMin: 0 });
    expect(t.kinds()).toEqual(['free_time_used']);
    expect(t.notifier.log[0]).toMatchObject({ title: "Free time's up \u2014 the forecast is live", body: 'Clouds can roll in until 04:00 when the pull gets strong.' });
  });
});

describe('umbrella time', () => {
  it('warns once when it drops under 5 minutes, and re-arms after it recovers', () => {
    const t = setup();
    t.setBalance(8);
    expect(t.kinds()).toEqual([]);
    t.setBalance(4);
    t.setBalance(3);
    expect(t.kinds()).toEqual(['umbrella_low']);
    expect(t.notifier.log[0]).toMatchObject({ title: 'Umbrella under 5 min', body: '4 minutes left on this one. Fold it whenever you like.' });
    t.setBalance(25); // a quest paid out
    t.setBalance(2);
    expect(t.kinds()).toEqual(['umbrella_low', 'umbrella_low']);
  });

  it('keeps the persistent notification current with weather and umbrella time', () => {
    const t = setup();
    expect(t.blocker.notification()).toEqual({ title: 'Clear skies · umbrella 30 min', text: '2 h 0 m of free time left.' });
    t.setPosture({ posture: 'metered', allowanceLeftMin: 0, nextChange: { at: at(14), to: 'open' } });
    t.setBalance(12);
    expect(t.blocker.notification()).toEqual({ title: 'Cloudy · umbrella 12 min', text: 'Clears at 14:00. Free time is used up for today.' });
  });
});

describe('quests', () => {
  it('announces a passed quest with its minutes', () => {
    const t = setup();
    t.verify({ type: 'fitness' }, { pass: true }, 25);
    expect(t.notifier.log[0]).toMatchObject({ kind: 'quest_verified', title: '2,000 steps — 25 minutes of umbrella time', body: 'Umbrella time: 30 min.' });
  });

  it('stays quiet for a miss: a retry hint is on the quest sheet, not a notification', () => {
    const t = setup();
    t.verify({ type: 'place' }, { pass: false }, 0);
    expect(t.kinds()).toEqual([]);
  });
});

describe('fmtClock', () => {
  it('pads to HH:MM', () => {
    expect(fmtClock(at(9, 5))).toBe('09:05');
    expect(MIN).toBe(60_000);
  });
});
