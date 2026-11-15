// OWNER: C (task C6). Demo panel actions on the fake engine, on the real engine, and on stubs.
import type { Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createMemoryKV as createLedgerKV } from '../../ledger/kv';
import { wireLedger } from '../../ledger/wiring';
import { MIN } from '../../shared/emitter';
import { createClock } from '../clock';
import {
  advance,
  applySeed,
  atLocalTime,
  capabilitiesOf,
  forceWeather,
  quickOpens,
  resetEverything,
  setFreeTimeLeft,
  type DemoDebugs,
} from '../demo';
import { createFakeEngine } from '../fakes';
import { createMemoryKV } from '../kv';
import { createRealEngine } from '../real';
import { formatHm } from '../time';

/** Local time on Monday Nov 16, 2026; never UTC. */
const at = (h: number, m = 0, day = 16) => new Date(2026, 10, day, h, m).getTime();

function withFakes(engine: ReturnType<typeof createFakeEngine> | ReturnType<typeof createRealEngine>, ledgerKind: 'fake' | 'real') {
  const services = {} as Services;
  const get = () => services;
  const ledger = ledgerKind === 'real' ? wireLedger(get, createLedgerKV()) : createFakeLedger(get);
  const device = createFakeDevice(get);
  const day = createFakeDay(get);
  Object.assign(services, engine.services, ledger.services, device.services, day.services);
  const debugs: DemoDebugs = { engine: engine.debug, ledger: ledger.debug, device: device.debug, day: day.debug };
  return { services, debugs, device };
}

function realSetup(start = at(9, 0)) {
  let wall = start;
  const clock = createClock({ wallNow: () => wall, monoNow: () => wall, timers: { setInterval: () => 0, clearInterval: () => {} } });
  const services = {} as Services;
  const engine = createRealEngine(() => services, { kv: createMemoryKV(), clock });
  const rig = withFakes(engine, 'real');
  Object.assign(services, rig.services);
  rig.services.postureSource.get(); // first use starts the readings
  return { ...rig, engine, clock, setWall: (t: number) => (wall = t) };
}

describe('atLocalTime', () => {
  test('lands on the same local date at the given time', () => {
    // Arrange
    const now = at(9, 15);

    // Act
    const t = atLocalTime(now, 14 * 60);

    // Assert
    expect(formatHm(t)).toBe('14:00');
    expect(new Date(t).getDate()).toBe(16);
  });

  test('02:00 belongs to the Toll day that started at 04:00, so 23:30 is the evening before', () => {
    // Arrange
    const now = at(2, 0, 17); // still Monday's Toll day

    // Act
    const evening = atLocalTime(now, 23 * 60 + 30);
    const earlyMorning = atLocalTime(now, 60);

    // Assert
    expect(evening).toBe(at(23, 30, 16));
    expect(earlyMorning).toBe(at(1, 0, 17));
  });
});

describe('capabilitiesOf', () => {
  test('fake engine cannot hand the weather back; fake device can scroll and quick-open', () => {
    // Arrange
    const { debugs } = withFakes(createFakeEngine(), 'fake');

    // Act
    const caps = capabilitiesOf(debugs);

    // Assert
    expect(caps).toEqual({ canRelease: false, canScroll: true, canQuickOpen: true });
  });

  test('real engine can hand the weather back', () => {
    const { debugs } = realSetup();
    expect(capabilitiesOf(debugs).canRelease).toBe(true);
  });

  test('a device without the optional controls reports them missing', () => {
    // Arrange
    const { debugs } = withFakes(createFakeEngine(), 'fake');
    const bare: DemoDebugs = { ...debugs, device: { reset: () => {}, seed: () => {} } };

    // Act + Assert
    expect(capabilitiesOf(bare)).toMatchObject({ canScroll: false, canQuickOpen: false });
    expect(quickOpens(bare)).toBe(false);
  });
});

describe('forceWeather', () => {
  test('forces Storm on the fake; refuses to release there', () => {
    // Arrange
    const { debugs, services } = withFakes(createFakeEngine(), 'fake');

    // Act
    const forced = forceWeather(debugs, 'sealed');
    const released = forceWeather(debugs, null);

    // Assert
    expect(forced).toBe(true);
    expect(released).toBe(false);
    expect(services.postureSource.get().posture).toBe('sealed');
  });

  test('real engine: force Cloudy, then back to the forecast', () => {
    // Arrange
    const { debugs, services } = realSetup();
    const forecast = services.postureSource.get().posture;

    // Act
    forceWeather(debugs, 'metered');
    const during = services.postureSource.get().posture;
    forceWeather(debugs, null);

    // Assert
    expect(forecast).not.toBe('metered');
    expect(during).toBe('metered');
    expect(services.postureSource.get().posture).toBe(forecast);
  });
});

describe('free time, time and quick opens', () => {
  test('free time is clamped to 0..120 and shows at once', () => {
    // Arrange
    const { debugs, services } = realSetup();

    // Act + Assert
    setFreeTimeLeft(debugs, -5);
    expect(services.postureSource.get().allowanceLeftMin).toBe(0);
    setFreeTimeLeft(debugs, 500);
    expect(services.postureSource.get().allowanceLeftMin).toBe(120);
  });

  test('advance moves the clock by whole minutes', () => {
    // Arrange
    const { debugs, clock } = realSetup();
    const before = clock.now();

    // Act
    advance(debugs.engine.clock, 15);

    // Assert
    expect(clock.now() - before).toBe(15 * MIN);
  });

  test('quick opens send five intercepts through the usage feed', () => {
    // Arrange
    const { debugs, services } = realSetup();
    const seen: string[] = [];
    services.usageFeed.onIntercept((s) => seen.push(s.pkg));

    // Act
    const ok = quickOpens(debugs);

    // Assert
    expect(ok).toBe(true);
    expect(seen).toHaveLength(5);
  });
});

describe('applySeed', () => {
  test('demo_2pm sets 14:00 at normal speed, Storm, umbrella 30, on the real engine and ledger', () => {
    // Arrange
    const { debugs, services, clock } = realSetup();
    clock.setSpeed(60);

    // Act
    applySeed(debugs, 'demo_2pm');

    // Assert
    expect(formatHm(clock.now())).toBe('14:00');
    expect(clock.speed()).toBe(1);
    expect(services.postureSource.get().posture).toBe('sealed');
    expect(services.ledger.balance()).toBe(30);
  });

  test('late_night sets 23:30 with no free time left', () => {
    // Arrange
    const { debugs, services, clock } = realSetup();

    // Act
    applySeed(debugs, 'late_night');

    // Assert
    expect(formatHm(clock.now())).toBe('23:30');
    expect(services.postureSource.get().allowanceLeftMin).toBe(0);
  });

  test('no_plan leaves the time alone and clears the plan (fake day)', () => {
    // Arrange
    const { debugs, services } = withFakes(createFakeEngine(), 'fake');
    const before = formatHm(services.clock.now());

    // Act
    applySeed(debugs, 'no_plan');

    // Assert
    expect(formatHm(services.clock.now())).toBe(before);
    expect(services.planner.planSet()).toBe(false);
  });

  test('seeds every folder in order: engine, ledger, device, day', () => {
    // Arrange
    const calls: string[] = [];
    const folder = (name: string) => ({ reset: () => {}, seed: (s: string) => calls.push(`${name}:${s}`) });
    const clock = { now: () => at(9), setNow: jest.fn(), setSpeed: jest.fn(), speed: () => 1, tick: () => {}, resetNow: jest.fn() };
    const d: DemoDebugs = {
      engine: { ...folder('engine'), clock, postureSource: createFakeEngine().debug.postureSource },
      ledger: { ...folder('ledger'), setBalance: () => {} },
      device: folder('device'),
      day: { ...folder('day'), addSteps: () => {} },
    };

    // Act
    applySeed(d, 'no_plan');

    // Assert
    expect(calls).toEqual(['engine:no_plan', 'ledger:no_plan', 'device:no_plan', 'day:no_plan']);
    expect(clock.setNow).not.toHaveBeenCalled();
  });
});

describe('resetEverything', () => {
  test('real: back to wall time at speed 1, thresholds default, forces cleared, fresh ledger', () => {
    // Arrange
    const { debugs, services, clock, engine } = realSetup(at(9, 0));
    applySeed(debugs, 'demo_2pm');
    clock.setSpeed(60);
    engine.debug.weather.set({ cloudyAt: 20 });

    // Act
    resetEverything(debugs);

    // Assert
    expect(clock.now()).toBe(at(9, 0));
    expect(clock.speed()).toBe(1);
    expect(engine.debug.weather.get().cloudyAt).toBe(35);
    expect(services.postureSource.get().posture).toBe('open');
    expect(services.ledger.balance()).toBe(0);
  });

  test('fake: clears the forced Storm and stops scrolling', () => {
    // Arrange
    const { debugs, services, device } = withFakes(createFakeEngine(), 'fake');
    const scrolling = jest.spyOn(device.debug, 'simulateScrolling');
    forceWeather(debugs, 'sealed');

    // Act
    resetEverything(debugs);

    // Assert
    expect(services.postureSource.get().posture).toBe('open');
    expect(scrolling).toHaveBeenCalledWith(false);
    expect(debugs.engine.clock.speed()).toBe(1);
  });
});
