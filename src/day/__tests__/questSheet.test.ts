import type { Posture, Quest, Services, Verdict } from '../../contracts';
import { createFakeDevice, HOME } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter, MIN } from '../../shared/emitter';
import { createFakeDay } from '../fakes';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { afterAccept, afterVerify, activeView, notYetView, offerView, onVerifiedPhase, openPhase, passView, pickOffer, readout, type Phase, type SheetPort } from '../quest-sheet';
import { engineSheetPort, fakeSheetPort } from '../quest-sheet-port';
import { createQuestEngine } from '../quests';
import type { MeetupCode } from '../wordlist';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const CODE: MeetupCode = ['BEACH', 'TRUCK', 'ZEBRA'];
const NO_LIVE = { steps: 0, awayMin: 0, distanceM: null, offMs: 0 };

function servicesStub(state: { now: number; posture: Posture }) {
  const services = {} as Services;
  const ticks = createEmitter<number>();
  Object.assign(services, {
    clock: { now: () => state.now, onTick: (fn: (t: number) => void) => ticks.on(fn) },
    postureSource: { get: () => ({ posture: state.posture }) },
  });
  return { services, get: () => services };
}

/** The hour-0 fakes, as the sheet sees them with USE_REAL=false. */
function fakeSetup(posture: Posture = 'open') {
  const state = { now: at(14), posture };
  const { services, get } = servicesStub(state);
  const ledger = createFakeLedger(get);
  const day = createFakeDay(get);
  Object.assign(services, ledger.services, day.services);
  const port = fakeSheetPort({
    now: () => state.now,
    accept: day.debug.accept,
    passActive: day.debug.passActive,
    quests: day.services.quests,
    ledger: ledger.services.ledger,
    meetupCode: () => CODE,
  });
  return { port, ledger, day, state };
}

/** The real quest engine behind the sheet. */
function engineSetup() {
  const state = { now: at(14), posture: 'open' as Posture };
  const { services, get } = servicesStub(state);
  const kv = createMemoryKV();
  const store = createPlannerStore({ kv, now: () => state.now });
  store.setHome(HOME);
  const planActions = createPlanActions(store, { now: () => state.now });
  const ledger = createFakeLedger(get);
  const device = createFakeDevice(get);
  Object.assign(services, ledger.services);
  const engine = createQuestEngine({
    now: () => state.now,
    kv,
    ledger: ledger.services.ledger,
    deviceSignals: device.services.deviceSignals,
    planner: store,
    planActions,
    steps: { subscribe: () => () => {} },
    meetupCode: () => CODE,
  });
  engine.start();
  const port = engineSheetPort(engine, store, () => state.now);
  return { port, engine, store, planActions, ledger, device, state };
}

const offerOf = (p: Phase) => {
  if (p.kind !== 'offer') throw new Error(`expected offer, got ${p.kind}`);
  return p;
};
const activeOf = (p: Phase) => {
  if (p.kind !== 'active' && p.kind !== 'notYet') throw new Error(`expected active, got ${p.kind}`);
  return p;
};

describe('opening the sheet', () => {
  test('with nothing live it offers the suggested quest', () => {
    // Arrange
    const { port } = engineSetup();
    // Act
    const phase = openPhase(port);
    // Assert
    expect(phase).toMatchObject({ kind: 'offer', type: 'fitness', error: null });
  });

  test('a live quest resumes in progress instead of offering', () => {
    // Arrange
    const { port, engine } = engineSetup();
    const r = engine.accept('focus');
    // Act
    const phase = openPhase(port);
    // Assert
    expect(r.ok).toBe(true);
    expect(phase).toMatchObject({ kind: 'active', quest: { type: 'focus' } });
  });

  test("Today's Verify on a plan task offers that task's quest", () => {
    // Arrange
    const { port, planActions, store } = engineSetup();
    planActions.startPlan([{ type: 'place', title: 'Library' }]);
    const taskId = store.getState().plan!.tasks[0].id;
    // Act
    const phase = openPhase(port, { offer: { type: 'place', taskId } });
    // Assert
    expect(phase).toEqual({ kind: 'offer', type: 'place', taskId, error: null });
  });

  test('picking the chip of a quest already running resumes it (no dead end)', () => {
    // Arrange
    const { port, engine } = engineSetup();
    engine.accept('focus');
    // Act
    const phase = pickOffer('focus', port.live());
    // Assert
    expect(phase).toMatchObject({ kind: 'active', quest: { type: 'focus' } });
    expect(pickOffer('fitness', port.live())).toEqual({ kind: 'offer', type: 'fitness', error: null });
  });

  test('a live meetup opens the meetup capture flow', () => {
    // Arrange
    const { port, engine } = engineSetup();
    engine.accept('meetup');
    // Act
    const phase = openPhase(port, { offer: { type: 'meetup' } });
    // Assert
    expect(phase.kind).toBe('meetup');
  });
});

describe('offer → active → result', () => {
  test('Start quest moves to in progress; a refusal stays on the offer with the reason', () => {
    // Arrange
    const { port } = engineSetup();
    const offer = offerOf(openPhase(port));
    // Act
    const started = afterAccept(offer, port.accept('fitness'));
    const again = afterAccept(offer, port.accept('fitness'));
    // Assert
    expect(started.kind).toBe('active');
    expect(again).toMatchObject({ kind: 'offer', error: 'You already have a fitness quest going' });
  });

  test('Verify with too few steps lands on not yet with a retry countdown', () => {
    // Arrange
    const { port, state } = engineSetup();
    const active = activeOf(afterAccept(offerOf(openPhase(port)), port.accept('fitness')));
    state.now += 10 * MIN;
    // Act
    const phase = afterVerify(active, port.verify(active.quest.id));
    // Assert
    expect(phase).toMatchObject({ kind: 'notYet', reason: '0 of 2,000 steps so far — keep walking.', retryAt: state.now + 5 * MIN });
  });

  test('an auto-pass while the sheet is open moves it to the pass screen', () => {
    // Arrange
    const { port, engine, ledger } = engineSetup();
    let phase = afterAccept(offerOf(openPhase(port)), port.accept('fitness'));
    engine.onVerified((q, v, minted) => {
      phase = onVerifiedPhase(phase, q, v, minted, false);
    });
    // Act
    engine.debug.addSteps(2000);
    // Assert
    expect(phase).toMatchObject({ kind: 'passed', minted: 25, umbrellaUp: false, half: false });
    expect(passView(phase as Extract<Phase, { kind: 'passed' }>, ledger.services.ledger.balance())).toMatchObject({ headline: '2,000 steps.', balance: 55 });
  });

  test("another quest's pass leaves the sheet alone", () => {
    // Arrange
    const { port, engine } = engineSetup();
    const phase = afterAccept(offerOf(openPhase(port)), port.accept('focus'));
    const other = { id: 'other', type: 'fitness' } as Quest;
    // Act
    const next = onVerifiedPhase(phase, other, { method: 'step_delta' } as Verdict, 25, false);
    // Assert
    expect(next).toBe(phase);
    expect(engine.active()).toHaveLength(1);
  });

  test('claim half after a miss credits half and says so', () => {
    // Arrange
    const { port, state, ledger } = engineSetup();
    const active = activeOf(afterAccept(offerOf(openPhase(port)), port.accept('fitness')));
    state.now += 10 * MIN;
    const notYet = activeOf(afterVerify(active, port.verify(active.quest.id)));
    const view = notYetView(port, notYet as Extract<Phase, { kind: 'notYet' }>, port.progress(active.quest.id), state.now);
    // Act
    const phase = afterVerify(notYet, port.claimHalf(active.quest.id), true);
    // Assert
    expect(view.claimHalf).toBe("Didn't catch it? Claim half — 13 min");
    expect(phase).toMatchObject({ kind: 'passed', minted: 13, half: true, umbrellaUp: false });
    expect(passView(phase as Extract<Phase, { kind: 'passed' }>, ledger.services.ledger.balance())).toEqual({
      headline: 'Half it is.',
      sub: '13 minutes dropped into your umbrella.',
      balance: 43,
      fraction: 43 / 60,
    });
  });

  test('Stop quest ends it and the next open offers again', () => {
    // Arrange
    const { port } = engineSetup();
    const active = activeOf(afterAccept(offerOf(openPhase(port)), port.accept('place')));
    // Act
    port.abandon(active.quest.id);
    // Assert
    expect(port.live()).toEqual([]);
    expect(openPhase(port).kind).toBe('offer');
  });
});

describe('view models', () => {
  test('offer 3.1: pays line, checks, and the other quests with their pay', () => {
    // Arrange
    const { port } = engineSetup();
    // Act
    const view = offerView(port, offerOf(openPhase(port)));
    // Assert
    expect(view.title).toBe('Walk 2,000 steps');
    expect(view.pays).toBe('Pays 25 min of umbrella time');
    expect(view.checks).toEqual(['The step counter on this phone', 'Nothing leaves your device', 'No rush — finish any time today']);
    expect(view.others.map((c) => `${c.label} ${c.pays}`)).toEqual(['Away 45 min +25', 'Meetup +25', 'Quiz +20', 'Commit +20', 'Phone-down +15']);
    expect(view.others.filter((c) => c.disabled).map((c) => c.type)).toEqual(['study', 'coding']);
    expect(view.blocked).toBeNull();
  });

  test('a task added after the lock pays half on the offer', () => {
    // Arrange
    const { port, planActions, store, state } = engineSetup();
    planActions.startPlan([{ type: 'focus', title: 'Read' }]);
    state.now += 40 * MIN;
    planActions.addTask({ type: 'fitness', title: 'Walk' });
    const taskId = store.getState().plan!.tasks[1].id;
    // Act
    const view = offerView(port, offerOf(openPhase(port, { offer: { type: 'fitness', taskId } })));
    // Assert
    expect(view.pays).toBe('Pays 13 min of umbrella time');
  });

  test('picking another quest drops the plan-task link', () => {
    // Act / Assert
    expect(pickOffer('focus')).toEqual({ kind: 'offer', type: 'focus', error: null });
  });

  test('readout 3.2 steps', () => {
    // Act
    const r = readout('fitness', { ...NO_LIVE, steps: 1395 });
    // Assert
    expect(r).toEqual({ big: '1,395', sub: 'of 2,000 steps', fraction: 1395 / 2000, line: 'About 7 minutes of walking left' });
  });

  test('readout 3.3 away from home', () => {
    // Act
    const r = readout('place', { ...NO_LIVE, awayMin: 33, distanceM: 822 });
    const close = readout('place', { ...NO_LIVE, distanceM: 204 });
    const noFix = readout('place', NO_LIVE);
    // Assert
    expect(r).toEqual({ big: '33', sub: 'of 45 minutes', fraction: 33 / 45, line: '820 m from home · keep wandering' });
    expect(close.line).toBe('200 m from home · head past 500 m');
    expect(noFix.line).toBe('Waiting for a location fix');
  });

  test('readout 3.4 phone-down', () => {
    // Act
    const r = readout('focus', { ...NO_LIVE, offMs: 18 * MIN + 26_000 });
    // Assert
    expect(r).toMatchObject({ big: '18:26', sub: 'of 25:00', line: 'Face down, screen off. Keep it there.' });
  });

  test('readout caps at the target and says to verify', () => {
    // Act
    const r = readout('fitness', { ...NO_LIVE, steps: 2600 });
    // Assert
    expect(r).toMatchObject({ big: '2,000', fraction: 1, line: "That's the lot — tap Verify now" });
  });

  test('in progress: title and pay line', () => {
    // Arrange
    const { port, engine } = engineSetup();
    const r = engine.accept('focus');
    if (!r.ok) throw new Error(r.error);
    // Act
    const view = activeView(port, r.quest, port.progress(r.quest.id));
    // Assert
    expect(view.title).toBe('Phone-down focus');
    expect(view.pays).toBe("Pays 15 min when it's done");
  });

  test('not yet 3.6: kind reason, hint, countdown, then a ready retry', () => {
    // Arrange
    const port = { taskRate: () => 1 } as unknown as SheetPort;
    const quest = { id: 'q', type: 'place', target: 45 } as Quest;
    const phase = { kind: 'notYet' as const, quest, reason: "You're 200 m from home — need 500 m.", retryAt: at(14, 5) };
    const progress = { live: NO_LIVE, canClaimHalf: true, retryAt: at(14, 5) };
    // Act
    const waiting = notYetView(port, phase, progress, at(14, 0) + 9_000);
    const ready = notYetView(port, phase, progress, at(14, 5));
    // Assert
    expect(waiting).toEqual({
      reason: "You're 200 m from home — need 500 m.",
      hint: "The 45 minutes start once you're past 500 m.",
      retry: { label: 'Try again in 4:51', ready: false },
      claimHalf: "Didn't catch it? Claim half — 13 min",
    });
    expect(ready.retry).toEqual({ label: 'Try again', ready: true });
  });

  test('pass in a Storm says the umbrella is up', () => {
    // Arrange
    const phase = { kind: 'passed' as const, quest: { type: 'fitness' } as Quest, minted: 25, umbrellaUp: true, half: false };
    // Act
    const view = passView(phase, 30);
    // Assert
    expect(view).toMatchObject({ headline: '2,000 steps.', sub: 'Umbrella up — 25 minutes, starting now.' });
  });
});

describe('fakes (USE_REAL=false)', () => {
  test('stub Verify passes and credits the fake ledger, ticking the fake plan', () => {
    // Arrange
    const { port, ledger, day } = fakeSetup();
    const active = activeOf(afterAccept(offerOf(openPhase(port)), port.accept('fitness')));
    // Act
    const phase = afterVerify(active, port.verify(active.quest.id));
    // Assert
    expect(phase).toMatchObject({ kind: 'passed', minted: 25, umbrellaUp: false });
    expect(ledger.services.ledger.balance()).toBe(55);
    expect(day.services.planner.progress()).toEqual({ done: 3, total: 5 });
    expect(port.live()).toEqual([]);
  });

  test('stub not-yet then claim half credits half to the fake ledger', () => {
    // Arrange
    const { port, ledger } = fakeSetup();
    const active = activeOf(afterAccept(offerOf(openPhase(port)), port.accept('place')));
    // Act
    const notYet = afterVerify(active, port.simulateMiss!(active.quest.id));
    const passed = afterVerify(activeOf(notYet), port.claimHalf(active.quest.id), true);
    // Assert
    expect(notYet).toMatchObject({ kind: 'notYet', reason: "You're 200 m from home — need 500 m." });
    expect(passed).toMatchObject({ kind: 'passed', minted: 13, half: true });
    expect(ledger.services.ledger.balance()).toBe(43);
    expect(port.live()).toEqual([]);
  });

  test('claim half needs a miss first', () => {
    // Arrange
    const { port } = fakeSetup();
    const r = port.accept('focus');
    if (!r.ok) throw new Error(r.error);
    // Act / Assert
    expect(port.claimHalf(r.quest.id)).toEqual({ kind: 'unavailable', error: 'Give Verify a try first' });
  });

  test('a pass in Storm opens the umbrella instead of banking minutes', () => {
    // Arrange
    const { port, ledger } = fakeSetup('sealed');
    const r = port.accept('fitness');
    if (!r.ok) throw new Error(r.error);
    // Act
    const phase = afterVerify({ kind: 'active', quest: r.quest, notice: null }, port.verify(r.quest.id));
    // Assert
    expect(phase).toMatchObject({ kind: 'passed', umbrellaUp: true, minted: 25 });
    expect(ledger.services.ledger.balance()).toBe(30);
  });

  test('a meetup on fakes is the practice OCR check: no credit, ends on a match', () => {
    // Arrange
    const { port, ledger } = fakeSetup();
    const phase = afterAccept(offerOf(pickOffer('meetup')), port.accept('meetup'));
    if (phase.kind !== 'meetup') throw new Error(phase.kind);
    const ctx = port.meetup(phase.quest.id)!;
    // Act
    const v = ctx.submit('BEACH ZEBRA');
    // Assert
    expect(ctx).toMatchObject({ code: CODE, practice: true });
    expect(v.kind).toBe('passed');
    expect(port.live()).toEqual([]);
    expect(ledger.services.ledger.balance()).toBe(30);
  });

  test('fakes: the commit quest asks for GitHub in Settings', () => {
    // Arrange
    const { port } = fakeSetup();
    // Act
    const r = port.accept('coding');
    // Assert
    expect(r).toEqual({ ok: false, error: 'Add your GitHub username in Settings → Planner' });
  });
});
