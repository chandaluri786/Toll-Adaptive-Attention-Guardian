// OWNER: C (task C11). The economy extras end to end: real engine + real ledger (fake A and B),
// driven by the demo panel's actions, plus the read-only Settings rows that show the rules.
import type { Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createMemoryKV as createLedgerKV } from '../../ledger/kv';
import { wireLedger } from '../../ledger/wiring';
import { createClock } from '../clock';
import { applySeed, forceWeather, type DemoDebugs } from '../demo';
import { createMemoryKV } from '../kv';
import { createRealEngine } from '../real';
import { ECONOMY_ROWS } from '../thresholds';
import { formatHm } from '../time';

const FORBIDDEN = /posture|\bopen\b|metered|sealed|blocked|failed/i;
const at = (h: number, m = 0, day = 16) => new Date(2026, 10, day, h, m).getTime();

function realSetup(start: number) {
  let wall = start;
  const clock = createClock({ wallNow: () => wall, monoNow: () => wall, timers: { setInterval: () => 0, clearInterval: () => {} } });
  const services = {} as Services;
  const get = () => services;
  const engine = createRealEngine(get, { kv: createMemoryKV(), clock });
  const ledger = wireLedger(get, createLedgerKV());
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  Object.assign(services, engine.services, ledger.services, device.services, day.services);
  const debugs: DemoDebugs = { engine: engine.debug, ledger: ledger.debug, device: device.debug, day: day.debug };
  services.postureSource.get(); // first use starts the readings
  return { services, debugs, clock };
}

describe('late-night 2× through the real engine', () => {
  test('late_night seed, Cloudy, umbrella 40: 15 minutes cost 30', () => {
    // Arrange
    const { services, debugs, clock } = realSetup(at(9));
    applySeed(debugs, 'late_night');
    forceWeather(debugs, 'metered');
    debugs.ledger.setBalance(40);

    // Act
    const r = services.ledger.spend(15, 'restricted');

    // Assert
    expect(formatHm(clock.now())).toBe('23:30');
    expect(r.ok).toBe(true);
    expect(services.ledger.balance()).toBe(10);
  });

  test('the same spend at 14:00 costs 15', () => {
    const { services, debugs } = realSetup(at(9));
    applySeed(debugs, 'demo_2pm'); // umbrella 30
    forceWeather(debugs, 'metered');
    expect(services.ledger.spend(15, 'restricted').ok).toBe(true);
    expect(services.ledger.balance()).toBe(15);
  });
});

describe('diminishing returns through the real engine', () => {
  test('a second fitness quest in the late-night Storm opens 15 minutes, not 25', () => {
    // Arrange
    const { services, debugs, clock } = realSetup(at(9));
    applySeed(debugs, 'late_night'); // Storm
    services.ledger.credit({ category: 'fitness', questId: 'f1', rate: 1 });

    // Act
    const { event, window } = services.ledger.credit({ category: 'fitness', questId: 'f2', rate: 1 });

    // Assert
    expect(services.postureSource.get().posture).toBe('sealed');
    expect(event.deltaMinutes).toBe(15);
    expect(window?.until).toBe(clock.now() + 15 * 60_000);
  });
});

describe('Settings rows for the economy', () => {
  test('show both rules in weather words', () => {
    const text = ECONOMY_ROWS.map((r) => `${r.title} ${r.subtitle} ${r.right}`).join(' | ');
    expect(text).toMatch(/23:00/);
    expect(text).toMatch(/2×/);
    expect(text).toMatch(/100% · 60% · 30%/);
    expect(text).not.toMatch(FORBIDDEN);
  });
});
