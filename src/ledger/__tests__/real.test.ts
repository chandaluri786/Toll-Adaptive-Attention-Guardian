// OWNER: C (task C5). The real ledger through the other folders' hour-0 fakes (test-only imports;
// ledger code reaches them via get()). Times are local wall time, so the suite means the same in any TZ.
declare const require: (id: string) => unknown;
declare const __dirname: string;
type Fs = { readdirSync(p: string): string[]; readFileSync(p: string, enc: 'utf8'): string };
const fs = require('fs') as Fs;
const path = require('path') as { join(...parts: string[]): string };
import type { Clock, Posture, Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakePostureSource } from '../../engine/fakes';
import { createEmitter, MIN } from '../../shared/emitter';
import { createMemoryKV, type KV } from '../kv';
import { createRealLedger, type RealLedgerDeps } from '../real';
import { dayKey } from '../time';

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

type HarnessOpts = { kv?: KV } & Pick<RealLedgerDeps, 'unlocksOn' | 'emergencyWindow' | 'onEmergency'>;

function harness(start: number, opts: HarnessOpts = {}) {
  let now = start;
  const ticks = createEmitter<number>();
  const clock: Clock = { now: () => now, onTick: (fn) => ticks.on(fn) };
  const services = { clock } as unknown as Services;
  const get = () => services;
  const postureSource = createFakePostureSource(clock);
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  const kv = opts.kv ?? createMemoryKV();
  const { unlocksOn, emergencyWindow, onEmergency } = opts;
  const made = createRealLedger({ get, kv, unlocksOn, emergencyWindow, onEmergency });
  Object.assign(services, { postureSource, ledger: made.services.ledger, ...device.services, ...day.services });
  return {
    ...made,
    services,
    ledger: made.services.ledger,
    kv,
    device,
    day,
    setNow: (t: number) => (now = t),
    advance: (ms: number) => (now += ms),
    tick: () => ticks.emit(now),
    weather: (p: Posture) => postureSource.setPosture(p),
    allowance: (min: number) => postureSource.setAllowance(min),
  };
}

/** A ledger first used at `began`, then moved to `now` (history only covers days since it began). */
function startedOn(began: number, now: number, opts: HarnessOpts = {}) {
  const h = harness(began, opts);
  h.ledger.balance();
  h.setNow(now);
  return h;
}

const sumOf = (h: ReturnType<typeof harness>) => h.debug.events().reduce((n, e) => n + e.deltaMinutes, 0);

describe('earning: table × rate', () => {
  it.each([
    ['fitness', 25],
    ['place', 25],
    ['meetup', 25],
    ['study', 20],
    ['coding', 20],
    ['focus', 15],
  ] as const)('%s mints %i at rate 1', (category, minutes) => {
    const h = harness(at(15, 9));
    const { event, window } = h.ledger.credit({ category, questId: 'q1', rate: 1 });
    expect(event.deltaMinutes).toBe(minutes);
    expect(event.category).toBe(category);
    expect(window).toBeNull();
    expect(h.ledger.balance()).toBe(minutes);
  });

  it('claim-half pays 50%, rounded half-up (fitness 13, focus 8)', () => {
    const h = harness(at(15, 9));
    expect(h.ledger.credit({ category: 'fitness', questId: 'a', rate: 0.5 }).event.deltaMinutes).toBe(13);
    expect(h.ledger.credit({ category: 'focus', questId: 'b', rate: 0.5 }).event.deltaMinutes).toBe(8);
    expect(h.ledger.balance()).toBe(21);
  });

  it('a rate outside 0..1 or not a number is clamped', () => {
    const h = harness(at(15, 9));
    expect(h.ledger.credit({ category: 'focus', questId: 'a', rate: 3 }).event.deltaMinutes).toBe(15);
    expect(h.ledger.credit({ category: 'focus', questId: 'b', rate: -1 }).event.deltaMinutes).toBe(0);
    expect(h.ledger.credit({ category: 'focus', questId: 'c', rate: NaN }).event.deltaMinutes).toBe(0);
  });
});

describe('events: append-only, balance = sum, idempotent ids', () => {
  it('the balance is the sum of the events', () => {
    const h = harness(at(15, 9));
    h.weather('metered');
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.ledger.credit({ category: 'study', questId: 'b', rate: 1 });
    h.ledger.spend(10, 'restricted');
    expect(h.ledger.balance()).toBe(35);
    expect(sumOf(h)).toBe(35);
  });

  it('crediting the same questId twice mints once', () => {
    const h = harness(at(15, 9));
    const first = h.ledger.credit({ category: 'fitness', questId: 'q-1', rate: 1 });
    const again = h.ledger.credit({ category: 'fitness', questId: 'q-1', rate: 1 });
    expect(again.event).toEqual(first.event);
    expect(h.ledger.balance()).toBe(25);
    expect(h.debug.events()).toHaveLength(1);
  });

  it('events are only ever appended (earlier events never change)', () => {
    const h = harness(at(15, 9));
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    const before = h.debug.events();
    h.ledger.spend(5, 'restricted');
    expect(h.debug.events().slice(0, before.length)).toEqual(before);
  });

  it('event ids are unique even at the same instant', () => {
    const h = harness(at(15, 9));
    h.debug.setBalance(30);
    h.ledger.spend(5, 'restricted');
    h.ledger.spend(5, 'restricted');
    const ids = h.debug.events().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** One first quest of every category: 25 + 25 + 25 + 20 + 20 + 15 = 130 minutes. */
const ONE_OF_EACH = ['fitness', 'place', 'meetup', 'study', 'coding', 'focus'] as const;
function creditOneOfEach(h: ReturnType<typeof harness>) {
  ONE_OF_EACH.forEach((category, i) => h.ledger.credit({ category, questId: `first-${i}`, rate: 1 }));
}

describe('daily mint cap: 150', () => {
  it('once 150 is minted the next quest mints 0', () => {
    const h = harness(at(15, 9));
    creditOneOfEach(h); // 130
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 }); // +15 = 145
    h.ledger.credit({ category: 'place', questId: 'p2', rate: 1 }); // +5 (15, capped) = 150
    const next = h.ledger.credit({ category: 'meetup', questId: 'm2', rate: 1 });
    expect(next.event.deltaMinutes).toBe(0);
    expect(h.ledger.balance()).toBe(150);
  });

  it('a quest that crosses the cap mints only what is left', () => {
    const h = harness(at(15, 9));
    creditOneOfEach(h); // 130
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 }); // 145
    expect(h.ledger.credit({ category: 'place', questId: 'p2', rate: 1 }).event.deltaMinutes).toBe(5);
  });

  it('spending does not give cap room back', () => {
    const h = harness(at(15, 9));
    h.weather('metered');
    creditOneOfEach(h);
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });
    h.ledger.credit({ category: 'place', questId: 'p2', rate: 1 }); // 150
    h.ledger.spend(100, 'restricted');
    expect(h.ledger.credit({ category: 'meetup', questId: 'x', rate: 1 }).event.deltaMinutes).toBe(0);
  });

  it('the cap refills at 04:00', () => {
    const h = harness(at(15, 22));
    creditOneOfEach(h);
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });
    h.ledger.credit({ category: 'place', questId: 'p2', rate: 1 }); // 150
    h.setNow(at(16, 4));
    expect(h.ledger.credit({ category: 'focus', questId: 'x', rate: 1 }).event.deltaMinutes).toBe(15);
  });
});

describe('spending (Cloudy, 1:1)', () => {
  it('S2: Cloudy, umbrella 30, Open umbrella 15 → a 15-min window, balance 15', () => {
    const h = harness(at(15, 14));
    h.debug.seed('demo_2pm');
    h.weather('metered');
    const r = h.ledger.spend(15, 'restricted');
    expect(r).toEqual({ ok: true, window: expect.objectContaining({ scope: 'restricted', source: 'spend', until: at(15, 14, 15) }) });
    expect(h.ledger.balance()).toBe(15);
    expect(h.ledger.activeWindows()).toHaveLength(1);
  });

  it('the window runs on the clock and unused time is not refunded', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(30);
    h.weather('metered');
    h.ledger.spend(15, 'restricted');
    h.advance(15 * MIN);
    expect(h.ledger.activeWindows()).toEqual([]);
    expect(h.ledger.balance()).toBe(15);
  });

  it('not enough umbrella → refused with the shortfall', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(10);
    h.weather('metered');
    expect(h.ledger.spend(15, 'restricted')).toEqual({ ok: false, shortfall: 5 });
    expect(h.ledger.balance()).toBe(10);
  });

  it('refused in Storm, even with minutes banked', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(30);
    h.weather('sealed');
    expect(h.ledger.spend(15, 'restricted')).toEqual({ ok: false, shortfall: 15 });
    expect(h.ledger.balance()).toBe(30);
    expect(h.ledger.activeWindows()).toEqual([]);
  });

  it('rejects a non-positive or fractional amount', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(30);
    for (const m of [0, -5, 1.5, NaN]) expect(h.ledger.spend(m, 'restricted')).toEqual({ ok: false, shortfall: 0 });
    expect(h.ledger.balance()).toBe(30);
  });

  it('a domain scope is carried onto the window (for the extension)', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(30);
    const r = h.ledger.spend(10, { domain: 'youtube.com' });
    expect(r.ok && r.window.scope).toEqual({ domain: 'youtube.com' });
  });
});

describe('the Sealed rule', () => {
  it('S3: Storm, umbrella 30, a steps quest passes → 25-min window at once, balance stays 30', () => {
    const h = harness(at(15, 23, 40));
    h.debug.setBalance(30);
    h.weather('sealed');
    const { event, window } = h.ledger.credit({ category: 'fitness', questId: 'q-storm', rate: 1 });
    expect(event.deltaMinutes).toBe(25); // B reads the minted minutes from here
    expect(window).toEqual(expect.objectContaining({ scope: 'restricted', source: 'quest', until: at(16, 0, 5) }));
    expect(h.ledger.balance()).toBe(30);
    expect(sumOf(h)).toBe(30);
  });

  it('banked minutes work again once the weather drops to Cloudy', () => {
    const h = harness(at(15, 20));
    h.debug.setBalance(30);
    h.weather('sealed');
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    h.weather('metered');
    expect(h.ledger.spend(30, 'restricted').ok).toBe(true);
  });

  it('the Storm window expires on the clock; the wall returns', () => {
    const h = harness(at(15, 20));
    h.weather('sealed');
    h.ledger.credit({ category: 'focus', questId: 'q', rate: 1 });
    h.advance(14 * MIN);
    expect(h.ledger.activeWindows()).toHaveLength(1);
    h.advance(1 * MIN);
    expect(h.ledger.activeWindows()).toEqual([]);
  });

  it('Storm mints count toward the cap; a capped quest opens no window', () => {
    const h = harness(at(15, 20));
    h.weather('sealed');
    for (let i = 1; i <= 6; i++) h.ledger.credit({ category: 'fitness', questId: `f${i}`, rate: 1 });
    expect(h.ledger.credit({ category: 'fitness', questId: 'f7', rate: 1 }).window).toBeNull();
  });

  it('a repeated Storm credit returns the same open window, not a second one', () => {
    const h = harness(at(15, 20));
    h.weather('sealed');
    const first = h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    const again = h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    expect(again.window).toEqual(first.window);
    expect(h.ledger.activeWindows()).toHaveLength(1);
  });

  it('obeys an injected posture over the shown weather (session 5: the enforced weather)', () => {
    let enforced: Posture = 'metered';
    const h = harness(at(15, 20));
    const ledger = createRealLedger({ get: () => h.services as unknown as Services, kv: createMemoryKV(), posture: () => enforced }).services.ledger;
    h.weather('sealed'); // shown weather (grace) is ignored
    ledger.credit({ category: 'focus', questId: 'x', rate: 1 });
    expect(ledger.spend(5, 'restricted').ok).toBe(true);
    enforced = 'sealed';
    expect(ledger.spend(5, 'restricted').ok).toBe(false);
  });
});

describe('the 04:00 local reset', () => {
  it('umbrella time goes back to 0 at 04:00, not before', () => {
    const h = harness(at(15, 23));
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.setNow(at(16, 3, 59));
    expect(h.ledger.balance()).toBe(25);
    h.setNow(at(16, 4));
    expect(h.ledger.balance()).toBe(0);
  });

  it('the reset is an event on the closed day, so every event still sums to the balance', () => {
    const h = harness(at(15, 23));
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.setNow(at(16, 9));
    h.ledger.credit({ category: 'focus', questId: 'b', rate: 1 });
    const reset = h.debug.events().find((e) => e.category === 'reset');
    expect(reset).toEqual(expect.objectContaining({ deltaMinutes: -25, at: at(16, 4) - 1 }));
    expect(h.ledger.balance()).toBe(15);
    expect(sumOf(h)).toBe(15);
  });

  it('several missed days are each closed once', () => {
    const h = harness(at(10, 12));
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.setNow(at(12, 12));
    h.ledger.credit({ category: 'focus', questId: 'b', rate: 1 });
    h.setNow(at(20, 12));
    expect(h.ledger.balance()).toBe(0);
    expect(h.ledger.balance()).toBe(0);
    expect(h.debug.events().filter((e) => e.category === 'reset')).toHaveLength(2);
    expect(sumOf(h)).toBe(0);
  });

  it('moving the clock backwards closes the later day too', () => {
    const h = harness(at(16, 12));
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.setNow(at(15, 12));
    expect(h.ledger.balance()).toBe(0);
    h.setNow(at(16, 13));
    expect(h.ledger.balance()).toBe(0);
  });

  it('a window bought at 03:50 still runs past 04:00', () => {
    const h = harness(at(16, 3, 50));
    h.debug.setBalance(40);
    h.ledger.spend(20, 'restricted'); // late night: 20 minutes cost 40
    h.setNow(at(16, 4, 5));
    expect(h.ledger.activeWindows()).toHaveLength(1);
    expect(h.ledger.balance()).toBe(0);
  });
});

describe('storage', () => {
  it('survives a restart (balance and idempotency)', () => {
    const kv = createMemoryKV();
    const a = harness(at(15, 9), { kv });
    a.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    a.ledger.spend(5, 'restricted');
    const b = harness(at(15, 9, 2), { kv });
    expect(b.ledger.balance()).toBe(20);
    expect(b.ledger.activeWindows()).toHaveLength(1);
    expect(b.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 }).event.deltaMinutes).toBe(25);
    expect(b.ledger.balance()).toBe(20);
  });

  it('corrupt storage reads as an empty ledger', () => {
    const kv = createMemoryKV();
    kv.set('events', '{not json');
    kv.set('windows', JSON.stringify([{ id: 1 }, null]));
    const h = harness(at(15, 9), { kv });
    expect(h.ledger.balance()).toBe(0);
    expect(h.ledger.activeWindows()).toEqual([]);
  });

  it('malformed stored events are dropped, good ones kept', () => {
    const kv = createMemoryKV();
    const good = { id: 'quest-a', at: at(15, 8), deltaMinutes: 25, category: 'fitness', questId: 'a' };
    kv.set('events', JSON.stringify([good, { id: 'x', at: 'soon', deltaMinutes: 5, category: 'fitness' }, { ...good, category: 'gold' }]));
    expect(harness(at(15, 9), { kv }).ledger.balance()).toBe(25);
  });

  it('every key lives under ledger:', () => {
    const h = harness(at(15, 9));
    h.start();
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    h.tick();
    expect(h.kv.keys().length).toBeGreaterThan(0);
    expect(h.kv.keys().every((k) => k.startsWith('ledger:'))).toBe(true);
    h.stop();
  });
});

describe('onChange', () => {
  it('fires on credit and spend, not on a refused spend or a repeat credit', () => {
    const h = harness(at(15, 9));
    const fn = jest.fn();
    h.ledger.onChange(fn);
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    h.ledger.spend(100, 'restricted');
    h.ledger.spend(5, 'restricted');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes', () => {
    const h = harness(at(15, 9));
    const fn = jest.fn();
    h.ledger.onChange(fn)();
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('history(days)', () => {
  it('returns local YYYY-MM-DD days, oldest first, ending with today (02:00 is still yesterday)', () => {
    const h = startedOn(at(-2, 9), at(1, 2)); // 1 Nov 02:00 → day of 31 Oct
    expect(h.ledger.history(3).map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
  });

  it('is capped at 180 days and ignores nonsense', () => {
    const h = startedOn(at(15 - 200, 9), at(15, 9));
    expect(h.ledger.history(500)).toHaveLength(180);
    expect(h.ledger.history(0)).toEqual([]);
    expect(h.ledger.history(-3)).toEqual([]);
    expect(h.ledger.history(NaN)).toEqual([]);
  });

  it('builds earned, spent, quest-opened minutes and quests by category from real events', () => {
    const h = harness(at(14, 9));
    h.weather('metered');
    h.ledger.credit({ category: 'fitness', questId: 'a', rate: 1 });
    h.ledger.spend(10, 'restricted');
    h.setNow(at(15, 21));
    h.ledger.credit({ category: 'focus', questId: 'b', rate: 1 });
    h.weather('sealed');
    h.ledger.credit({ category: 'focus', questId: 'c', rate: 1 });
    const [yesterday, today] = h.ledger.history(2);
    expect(yesterday).toEqual(
      expect.objectContaining({ date: '2026-11-14', earned: 25, spent: 10, questOpenedMin: 0, questsByCategory: { fitness: 1 } }),
    );
    expect(today).toEqual(
      expect.objectContaining({ date: '2026-11-15', earned: 24, spent: 0, questOpenedMin: 9, questsByCategory: { focus: 2 } }), // 2nd focus pays 60%
    );
  });

  it('emergency unlocks come from the injected governor log', () => {
    const unlocksOn = jest.fn((date: string) => (date === '2026-11-15' ? [at(15, 8)] : []));
    const h = startedOn(at(14, 9), at(15, 9), { unlocksOn });
    const [yesterday, today] = h.ledger.history(2);
    expect(yesterday.emergencyUnlocks).toEqual([]);
    expect(today.emergencyUnlocks).toEqual([at(15, 8)]);
  });

  it("today's tasks come from the planner; no plan reads null", () => {
    const h = harness(at(15, 9));
    expect(h.ledger.history(1)[0]).toEqual(expect.objectContaining({ tasksPlanned: 5, tasksDone: 2 }));
    h.day.debug.seed('no_plan');
    expect(h.ledger.history(1)[0]).toEqual(expect.objectContaining({ tasksPlanned: null, tasksDone: 0 }));
  });

  it('restricted, past-free and storm minutes come from the day tracker once started', () => {
    const h = harness(at(15, 14));
    h.start();
    for (let i = 0; i < 120; i++) h.device.debug.emitSample();
    h.allowance(0);
    for (let i = 0; i < 60; i++) h.device.debug.emitSample();
    h.weather('sealed');
    h.tick();
    h.tick();
    const [today] = h.ledger.history(1);
    expect(today).toEqual(expect.objectContaining({ restrictedMin: 3, pastFreeMin: 1, stormMin: 2 }));
    h.stop();
  });

  it('a day with nothing recorded is all zeros, no plan', () => {
    const h = startedOn(at(14, 9), at(15, 9));
    expect(h.ledger.history(2)[0]).toEqual({
      date: '2026-11-14',
      restrictedMin: 0,
      pastFreeMin: 0,
      stormMin: 0,
      questOpenedMin: 0,
      earned: 0,
      spent: 0,
      tasksPlanned: null,
      tasksDone: 0,
      questsByCategory: {},
      emergencyUnlocks: [],
    });
  });

  it('drops days older than 180 on the next reset', () => {
    const h = harness(at(1, 9));
    h.ledger.credit({ category: 'fitness', questId: 'old', rate: 1 });
    h.setNow(new Date(2026, 10, 1 + 181, 9).getTime());
    h.ledger.balance();
    expect(h.debug.events()).toEqual([]);
  });
});

describe('debug', () => {
  it('seeds: demo_2pm and no_plan start with an umbrella of 30, fresh and late_night with 0', () => {
    const h = harness(at(15, 14));
    h.debug.seed('demo_2pm');
    expect(h.ledger.balance()).toBe(30);
    h.debug.seed('no_plan');
    expect(h.ledger.balance()).toBe(30);
    h.debug.seed('late_night');
    expect(h.ledger.balance()).toBe(0);
    h.debug.seed('fresh');
    expect(h.ledger.balance()).toBe(0);
  });

  it('setBalance keeps balance = sum of events, never below 0', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(40);
    h.debug.setBalance(12);
    expect(h.ledger.balance()).toBe(12);
    expect(sumOf(h)).toBe(12);
    h.debug.setBalance(-5);
    expect(h.ledger.balance()).toBe(0);
  });

  it('reset clears events, windows and storage', () => {
    const h = harness(at(15, 14));
    h.debug.setBalance(30);
    h.ledger.spend(5, 'restricted');
    h.debug.reset();
    expect(h.ledger.balance()).toBe(0);
    expect(h.ledger.activeWindows()).toEqual([]);
    expect(h.debug.events()).toEqual([]);
  });
});

describe('boundaries', () => {
  it('ledger code never imports src/day, src/device or src/engine', () => {
    const dir = path.join(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/from '\.\.\/(day|device|engine)\//);
      expect(src).not.toMatch(/Date\.now\(|\.toISOString\(/);
    }
  });
});

describe('emergency window (A-phone-test bug 2)', () => {
  const emergency = { id: `em-${at(15, 9)}`, scope: 'all' as const, until: at(15, 9, 15), source: 'emergency' as const };

  it("activeWindows() includes the governor's live emergency window, next to bought windows", () => {
    // Arrange
    const h = harness(at(15, 9, 1), { emergencyWindow: () => emergency });
    h.weather('metered');
    h.debug.setBalance(30);

    // Act
    const bought = h.ledger.spend(15, 'restricted');

    // Assert
    expect(bought.ok).toBe(true);
    expect(h.ledger.activeWindows()).toEqual([bought.ok ? bought.window : null, emergency]);
  });

  it('an expired emergency window is left out', () => {
    const h = harness(at(15, 9, 15), { emergencyWindow: () => emergency });
    expect(h.ledger.activeWindows()).toEqual([]);
  });

  it('an emergency unlock fires onChange once the ledger has started (so enforcement re-plans)', () => {
    // Arrange
    const uses = createEmitter<void>();
    const h = harness(at(15, 9), { onEmergency: (fn) => uses.on(fn) });
    const fn = jest.fn();
    h.ledger.onChange(fn);

    // Act
    uses.emit(); // before start: not listening yet
    h.start();
    uses.emit();
    h.stop();
    uses.emit(); // after stop: unsubscribed

    // Assert
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('history only covers days since the ledger began (A-phone-test bug 3)', () => {
  it('a brand-new ledger reports just today, so Forecast can show its empty state', () => {
    const h = harness(at(15, 9));
    expect(h.ledger.history(14).map((d) => d.date)).toEqual(['2026-11-15']);
  });

  it('grows one day per local day, and still caps at the days asked for', () => {
    // Arrange
    const h = harness(at(13, 9));
    h.ledger.balance(); // first use records the start day

    // Act
    h.setNow(at(16, 3, 59)); // still the 15th (04:00 reset)
    const three = h.ledger.history(14).map((d) => d.date);
    h.setNow(at(16, 4));
    const capped = h.ledger.history(2).map((d) => d.date);

    // Assert
    expect(three).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    expect(capped).toEqual(['2026-11-15', '2026-11-16']);
  });

  it('the start day is stored, so a restart keeps the history', () => {
    // Arrange
    const kv = createMemoryKV();
    harness(at(13, 9), { kv }).ledger.balance();

    // Act
    const reopened = harness(at(15, 9), { kv });

    // Assert
    expect(reopened.ledger.history(14).map((d) => d.date)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });

  it('an older event moves the start back (ledgers from before this fix keep their days)', () => {
    // Arrange: an event stored on the 12th with no start day recorded
    const kv = createMemoryKV();
    kv.set('events', JSON.stringify([{ id: 'quest-old', at: at(12, 9), deltaMinutes: 25, category: 'fitness' }]));

    // Act
    const h = harness(at(14, 9), { kv });

    // Assert
    expect(h.ledger.history(14)[0].date).toBe('2026-11-12');
  });

  it('reset everything starts history again from today', () => {
    const h = harness(at(13, 9));
    h.ledger.balance();
    h.setNow(at(15, 9));
    h.debug.reset();
    expect(h.ledger.history(14).map((d) => d.date)).toEqual(['2026-11-15']);
  });
});

describe('absorb: spends made elsewhere (C9 pull-back)', () => {
  it('a laptop spend lowers today\'s balance and is not a phone window', () => {
    // Arrange
    const h = harness(at(15, 14));
    h.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    const before = h.ledger.balance();

    // Act
    const added = h.absorb([{ id: 'ext-a', deltaMinutes: -10, at: at(15, 13) }]);

    // Assert
    expect(added).toBe(1);
    expect(h.ledger.balance()).toBe(before - 10);
    expect(h.ledger.activeWindows()).toEqual([]);
    expect(h.debug.events().find((e) => e.id === 'ext-a')).toMatchObject({ category: 'spend', deltaMinutes: -10 });
  });

  it('the same id twice, or one the phone already has, is absorbed once', () => {
    const h = harness(at(15, 14));
    h.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });

    h.absorb([{ id: 'ext-a', deltaMinutes: -5, at: at(15, 13) }, { id: 'ext-a', deltaMinutes: -5, at: at(15, 13) }]);
    const again = h.absorb([{ id: 'ext-a', deltaMinutes: -5, at: at(15, 13) }, { id: 'quest-q1', deltaMinutes: -1, at: 1 }]);

    expect(again).toBe(0);
    expect(h.debug.events().filter((e) => e.id === 'ext-a')).toHaveLength(1);
  });

  it('ignores credits, fractions and events older than the 180 kept days', () => {
    const h = harness(at(15, 14));

    const added = h.absorb([
      { id: 'ext-plus', deltaMinutes: 50, at: at(15, 13) },
      { id: 'ext-frac', deltaMinutes: -1.5, at: at(15, 13) },
      { id: 'ext-old', deltaMinutes: -5, at: new Date(2025, 0, 1, 12).getTime() },
    ]);

    expect(added).toBe(0);
    expect(h.debug.events()).toEqual([]);
  });

  it('a spend on a past day is closed by that day\'s reset, so every past day still sums to 0', () => {
    const h = harness(at(15, 14));
    h.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    const today = h.ledger.balance();

    h.absorb([{ id: 'ext-yday', deltaMinutes: -7, at: at(14, 20) }]);

    expect(h.ledger.balance()).toBe(today);
    const yday = h.debug.events().filter((e) => dayKey(e.at) === '2026-11-14');
    expect(yday.reduce((n, e) => n + e.deltaMinutes, 0)).toBe(0);
  });

  it('a spend dated after the phone clock counts now (demo clock behind the laptop)', () => {
    const h = harness(at(15, 14));
    h.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    const before = h.ledger.balance();

    h.absorb([{ id: 'ext-future', deltaMinutes: -4, at: at(16, 10) }]);

    expect(h.ledger.balance()).toBe(before - 4);
    expect(h.debug.events().find((e) => e.id === 'ext-future')?.at).toBe(at(15, 14));
  });

  it('fires onChange once when something was absorbed, never when nothing was', () => {
    const h = harness(at(15, 14));
    const seen: number[] = [];
    h.ledger.onChange(() => seen.push(1));

    h.absorb([]);
    h.absorb([{ id: 'ext-a', deltaMinutes: -1, at: at(15, 13) }]);

    expect(seen).toHaveLength(1);
  });
});

describe('diminishing returns (C11): same category, one local day', () => {
  it('four fitness quests mint 25, 15, 8, 0', () => {
    // Arrange
    const h = harness(at(15, 9));

    // Act
    const minted = [1, 2, 3, 4].map((i) => h.ledger.credit({ category: 'fitness', questId: `f${i}`, rate: 1 }).event.deltaMinutes);

    // Assert
    expect(minted).toEqual([25, 15, 8, 0]);
    expect(h.ledger.balance()).toBe(48);
  });

  it('each category counts on its own', () => {
    const h = harness(at(15, 9));
    h.ledger.credit({ category: 'fitness', questId: 'f1', rate: 1 });
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });
    expect(h.ledger.credit({ category: 'study', questId: 's1', rate: 1 }).event.deltaMinutes).toBe(20);
  });

  it('a capped quest still counts as a repeat (it was logged)', () => {
    const h = harness(at(15, 9));
    creditOneOfEach(h);
    h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });
    h.ledger.credit({ category: 'place', questId: 'p2', rate: 1 }); // cap reached
    h.ledger.credit({ category: 'focus', questId: 'x2', rate: 1 }); // 0, but the 2nd focus
    h.setNow(at(16, 9));
    expect(h.ledger.credit({ category: 'focus', questId: 'y1', rate: 1 }).event.deltaMinutes).toBe(15); // new day
  });

  it('the count starts again at 04:00 (03:59 still belongs to yesterday)', () => {
    const h = harness(at(15, 22));
    h.ledger.credit({ category: 'fitness', questId: 'f1', rate: 1 });
    h.setNow(at(16, 3, 59));
    expect(h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 }).event.deltaMinutes).toBe(15);
    h.setNow(at(16, 4));
    expect(h.ledger.credit({ category: 'fitness', questId: 'f3', rate: 1 }).event.deltaMinutes).toBe(25);
  });

  it('a repeated questId is not a repeat quest (mints once, no count)', () => {
    const h = harness(at(15, 9));
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    h.ledger.credit({ category: 'fitness', questId: 'q', rate: 1 });
    expect(h.ledger.credit({ category: 'fitness', questId: 'r', rate: 1 }).event.deltaMinutes).toBe(15);
  });

  it('in a Storm the window is the diminished mint (2nd fitness → 15 min)', () => {
    const h = harness(at(15, 10));
    h.weather('sealed');
    h.ledger.credit({ category: 'fitness', questId: 'f1', rate: 1 });
    const { event, window } = h.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });
    expect(event.deltaMinutes).toBe(15);
    expect(window?.until).toBe(at(15, 10, 15));
  });

  it('a 4th quest in a Storm mints 0 and opens no window', () => {
    const h = harness(at(15, 10));
    h.weather('sealed');
    for (let i = 1; i <= 3; i++) h.ledger.credit({ category: 'focus', questId: `f${i}`, rate: 1 });
    const fourth = h.ledger.credit({ category: 'focus', questId: 'f4', rate: 1 });
    expect(fourth).toEqual({ event: expect.objectContaining({ deltaMinutes: 0 }), window: null });
  });
});

describe('late-night 2× cost (C11): from 23:00 to the 04:00 reset', () => {
  it('Cloudy at 23:30: 15 minutes of umbrella cost 30, the window is still 15 min', () => {
    // Arrange
    const h = harness(at(15, 23, 30));
    h.debug.setBalance(40);
    h.weather('metered');

    // Act
    const r = h.ledger.spend(15, 'restricted');

    // Assert
    expect(r).toEqual({ ok: true, window: expect.objectContaining({ until: at(15, 23, 45), source: 'spend' }) });
    expect(h.ledger.balance()).toBe(10);
    expect(h.debug.events().at(-1)).toEqual(expect.objectContaining({ deltaMinutes: -30, category: 'spend' }));
  });

  it('still 2× at 02:00 (same Toll day), back to 1:1 at 22:59', () => {
    const late = harness(at(16, 2));
    late.debug.setBalance(30);
    late.ledger.spend(10, 'restricted');
    expect(late.ledger.balance()).toBe(10);

    const evening = harness(at(15, 22, 59));
    evening.debug.setBalance(30);
    evening.ledger.spend(10, 'restricted');
    expect(evening.ledger.balance()).toBe(20);
  });

  it('the shortfall is in doubled minutes', () => {
    const h = harness(at(15, 23, 30));
    h.debug.setBalance(20);
    h.weather('metered');
    expect(h.ledger.spend(15, 'restricted')).toEqual({ ok: false, shortfall: 10 });
    expect(h.ledger.balance()).toBe(20);
  });

  it('still refused in Storm with the doubled shortfall', () => {
    const h = harness(at(15, 23, 30));
    h.debug.setBalance(60);
    h.weather('sealed');
    expect(h.ledger.spend(15, 'restricted')).toEqual({ ok: false, shortfall: 30 });
  });

  it('a Storm quest at night still opens its full mint (the multiplier is on banked spending)', () => {
    const h = harness(at(15, 23, 30));
    h.weather('sealed');
    const { window } = h.ledger.credit({ category: 'fitness', questId: 'f1', rate: 1 });
    expect(window?.until).toBe(at(15, 23, 55));
    expect(h.ledger.balance()).toBe(0);
  });

  it('history counts the doubled cost as spent; the day still closes to 0', () => {
    const h = harness(at(15, 23, 30));
    h.debug.setBalance(40);
    h.ledger.spend(15, 'restricted');
    h.setNow(at(16, 9));
    const yesterday = h.ledger.history(2).find((d) => d.date === dayKey(at(15, 23, 30)));
    expect(yesterday?.spent).toBe(30);
    expect(sumOf(h)).toBe(0);
  });
});
