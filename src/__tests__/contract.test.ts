// OWNER: all three. Proves the hour-0 wiring: every contract interface resolves through
// src/services.ts and the fakes behave the way the specs promise. Keep this green on main.
import services, { debug } from '../services';

beforeEach(() => {
  debug.engine.reset();
  debug.ledger.reset();
  debug.day.reset();
});

test('every interface in the contract is wired', () => {
  for (const key of ['clock', 'postureSource', 'governor', 'ledger', 'usageFeed', 'deviceSignals', 'planner', 'quests'] as const) {
    expect(services[key]).toBeDefined();
  }
});

test('Cloudy: spending umbrella time opens a window and lowers the balance', () => {
  debug.engine.postureSource.setPosture('metered');
  const before = services.ledger.balance();
  const r = services.ledger.spend(15, 'restricted');
  expect(r.ok).toBe(true);
  expect(services.ledger.balance()).toBe(before - 15);
  expect(services.ledger.activeWindows()).toHaveLength(1);
});

test('Storm: spending is refused, but a quest opens a window at once (balance unchanged)', () => {
  debug.engine.postureSource.setPosture('sealed');
  const before = services.ledger.balance();
  expect(services.ledger.spend(15, 'restricted').ok).toBe(false);
  const minted: number[] = [];
  const unsub = services.quests.onVerified((_q, _v, m) => minted.push(m));
  debug.day.passActive();
  unsub();
  expect(minted).toEqual([25]);
  expect(services.ledger.balance()).toBe(before);
  expect(services.ledger.activeWindows().some((w) => w.source === 'quest')).toBe(true);
});

test('emergency unlock works once a day', () => {
  expect(services.governor.emergencyLeftToday()).toBe(1);
  expect(services.governor.emergencyUnlock()?.scope).toBe('all');
  expect(services.governor.emergencyUnlock()).toBeNull();
  expect(services.governor.emergencyLeftToday()).toBe(0);
});

test('no plan is a normal state: no tasks, reminders offered', () => {
  debug.day.seed('no_plan');
  expect(services.planner.planSet()).toBe(false);
  expect(services.planner.progress().total).toBe(0);
  const nineAm = new Date(services.clock.now());
  nineAm.setHours(9, 0, 0, 0);
  expect(services.planner.remindersDue(nineAm.getTime())).toBe('morning');
});

test('device fake scripts: walk 600 m for 45 min emits 45 location samples', () => {
  const got: number[] = [];
  const unsub = services.deviceSignals.onLocation((s) => got.push(s.accuracyM));
  debug.device.walkAway(600, 45);
  unsub();
  expect(got).toHaveLength(45);
});

test('Forecast fake history has 180 deterministic days', () => {
  const a = services.ledger.history(180);
  const b = services.ledger.history(180);
  expect(a).toHaveLength(180);
  expect(a).toEqual(b);
});
