// OWNER: A (task A6). Every Storm / Cloud screen state from the approved design, as data. The expected
// copy below is taken word for word from the design (docs/DESIGN.md, screens 1.1-1.8).
import { SPEND_MINUTES, WAIT_SECONDS, nextEmergencyStep, openedViewModel, stormViewModel, type StormInput } from '../stormViewModel';

const base: StormInput = {
  posture: 'metered',
  reason: "Cloudy until 14:00 — free time's used up.",
  grace: false,
  appName: 'Scrollr',
  trigger: 'opened',
  balance: 18,
  emergencyLeft: 1,
  clearsAt: '14:00',
};
const door = (vm: ReturnType<typeof stormViewModel>, key: string) => vm.doors.find((d) => d.key === key);

describe('1.1 Cloudy, with umbrella time', () => {
  const vm = stormViewModel(base);
  it('shows the weather word, app badge, reason and when it clears', () => {
    expect(vm.mode).toBe('cloudy');
    expect(vm.weatherName).toBe('Cloudy');
    expect(vm.appName).toBe('Scrollr');
    expect(vm.appLetter).toBe('S');
    expect(vm.reason).toBe("Cloudy until 14:00 — free time's used up.");
    expect(vm.clears).toBe('Clears at 14:00');
  });
  it('umbrella card: 18 min, "Opening costs 15"', () => {
    expect(vm.umbrella).toEqual({ minutes: 18, note: 'Opening costs 15' });
  });
  it('three doors: wait (plain), open umbrella (primary, leaves 3), quest (plain)', () => {
    expect(vm.doors.map((d) => d.key)).toEqual(['wait', 'umbrella', 'quest']);
    expect(door(vm, 'wait')).toMatchObject({ icon: 'hourglass', title: 'Wait 60 seconds', sub: "A short pause. Doesn't add time.", variant: 'secondary', fill: 0 });
    expect(door(vm, 'umbrella')).toMatchObject({ icon: 'umbrella', title: 'Open umbrella — 15 min', sub: 'Leaves 3 min for later', variant: 'primary' });
    expect(door(vm, 'quest')).toMatchObject({ icon: 'sparkles', title: 'Take a quest', sub: 'Walk, focus or meet up to earn time', variant: 'secondary' });
  });
});

describe('1.2 Cloudy, not enough umbrella time', () => {
  const vm = stormViewModel({ ...base, balance: 9 });
  it('the umbrella door is dashed (disabled) and says how many minutes are missing', () => {
    expect(door(vm, 'umbrella')).toMatchObject({ variant: 'disabled', sub: 'You need 6 more minutes' });
  });
  it('the quest becomes the primary choice', () => {
    expect(door(vm, 'quest')?.variant).toBe('primary');
  });
});

describe('1.3 Storm', () => {
  const vm = stormViewModel({ ...base, posture: 'sealed', reason: "Storm until 11:00 — you're in Algorithms.", clearsAt: '11:00', balance: 4 });
  it('big word is Storm, with its clear time', () => {
    expect(vm.mode).toBe('storm');
    expect(vm.weatherName).toBe('Storm');
    expect(vm.clears).toBe('Clears at 11:00');
  });
  it('no umbrella door: banked minutes cannot open a restricted app in a Storm', () => {
    expect(vm.doors.map((d) => d.key)).toEqual(['wait', 'quest']);
    expect(vm.umbrella).toEqual({ minutes: 4, note: 'Storm takes fresh quest time only' });
  });
  it('quest is primary, with the fastest-quest hint', () => {
    expect(door(vm, 'quest')).toMatchObject({ variant: 'primary', sub: 'Fastest: 25 min phone-down pays 15 min' });
  });
  it('a big balance does not bring the umbrella door back', () => {
    expect(door(stormViewModel({ ...base, posture: 'sealed', balance: 999 }), 'umbrella')).toBeUndefined();
  });
});

describe('1.4 Waiting (Wait 60 seconds)', () => {
  it('counts down as "Breathe… m:ss" and fills the door', () => {
    const w = door(stormViewModel({ ...base, posture: 'sealed', waitLeft: 37 }), 'wait')!;
    expect(w.title).toBe('Breathe… 0:37');
    expect(w.sub).toBe("The sky's settling. This doesn't add time.");
    expect(w.fill).toBeCloseTo(23 / 60);
  });
  it('after a minute: "That\'s a minute", a tick, a full fill', () => {
    const w = door(stormViewModel({ ...base, posture: 'sealed', waitLeft: 0 }), 'wait')!;
    expect(w).toMatchObject({ icon: 'check', title: "That's a minute", sub: 'Still want it? Close the app, or take a quest.', fill: 1 });
  });
  it('grants nothing: umbrella time is unchanged', () => {
    expect(stormViewModel({ ...base, waitLeft: 10 }).umbrella.minutes).toBe(18);
  });
});

describe('1.6 Emergency unlock', () => {
  it('available: a plain link with the count', () => {
    expect(stormViewModel(base).emergency).toEqual({ available: true, label: 'Emergency unlock (1 left today)' });
  });
  it('already used, with the time it was used', () => {
    expect(stormViewModel({ ...base, emergencyLeft: 0, emergencyUsedAt: '08:12' }).emergency).toEqual({
      available: false,
      label: 'Emergency unlock used at 08:12. Back tomorrow.',
    });
  });
  it('already used, time unknown', () => {
    expect(stormViewModel({ ...base, emergencyLeft: 0 }).emergency.label).toBe('Emergency unlock used. Back tomorrow.');
  });
});

describe('1.8 Clouds gathering (90-second warning)', () => {
  const vm = stormViewModel({ ...base, posture: 'open', grace: true, graceLeft: 83, reason: 'Storm at 10:00 — Algorithms. Nothing changes until then.' });
  it('is a banner only: a countdown and the reason, no doors', () => {
    expect(vm.mode).toBe('grace');
    expect(vm.gather).toEqual({ title: 'Clouds gathering · 1:23', body: 'Storm at 10:00 — Algorithms. Nothing changes until then.' });
    expect(vm.doors).toEqual([]);
  });
});

describe('other details', () => {
  it('a discretionary app in a Storm can be opened with umbrella time at double cost', () => {
    const vm = stormViewModel({ ...base, posture: 'sealed', balance: 30, decision: { kind: 'intercept', canSpend: true, spendRate: 2, questPrimary: false } });
    expect(vm.umbrella.note).toBe('Opening costs 8');
    expect(door(vm, 'umbrella')).toMatchObject({ variant: 'primary', sub: 'Leaves 22 min for later' });
  });
  it('says so when the umbrella just ran out inside the app', () => {
    expect(stormViewModel({ ...base, trigger: 'expired' }).note).toBe('Your umbrella time just ran out.');
  });
  it('falls back to a generic name when the app is unknown', () => {
    expect(stormViewModel({ ...base, appName: null }).appName).toBe('a distracting app');
  });
  it('hides the clear-time line when the engine has no next change', () => {
    expect(stormViewModel({ ...base, clearsAt: null }).clears).toBeNull();
  });
  it('never uses the words the design bans', () => {
    const copy = JSON.stringify([
      stormViewModel(base),
      stormViewModel({ ...base, posture: 'sealed' }),
      stormViewModel({ ...base, grace: true }),
      stormViewModel({ ...base, balance: 0, emergencyLeft: 0, trigger: 'expired', waitLeft: 0 }),
      openedViewModel({ kind: 'umbrella', appName: 'Scrollr', balanceAfter: 3 }),
      openedViewModel({ kind: 'emergency', appName: 'Scrollr', pickUpAt: '10:29' }),
    ]).toLowerCase();
    for (const banned of ['blocked', 'failed', 'posture']) expect(copy).not.toContain(banned);
  });
});

describe('1.7 Umbrella opened (and the emergency version)', () => {
  it('umbrella: Cloudy sky, an umbrella, what is left', () => {
    expect(openedViewModel({ kind: 'umbrella', appName: 'Scrollr', balanceAfter: 3 })).toEqual({
      weather: 'metered',
      icon: 'umbrella',
      title: 'Umbrella up: 15 minutes.',
      sub: '3 min of umbrella time left after this one.',
      button: 'Open Scrollr',
    });
  });
  it('emergency: Clear sky, a sun, when the weather picks up again', () => {
    expect(openedViewModel({ kind: 'emergency', appName: 'Scrollr', pickUpAt: '10:29' })).toMatchObject({
      weather: 'open',
      icon: 'sun',
      title: 'Everything’s open for 15 minutes.',
      sub: 'The weather picks up again at 10:29.',
    });
  });
  it('the amount matches the constant', () => expect(SPEND_MINUTES).toBe(15));
  it('and the wait is a minute', () => expect(WAIT_SECONDS).toBe(60));
});

describe('emergency unlock: two taps plus a confirm', () => {
  it('walks tap -> tap -> confirm', () => {
    let s = nextEmergencyStep('idle', 'tap');
    expect(s).toBe('armed');
    s = nextEmergencyStep(s, 'tap');
    expect(s).toBe('confirming');
    expect(nextEmergencyStep(s, 'confirm')).toBe('done');
  });
  it('cannot skip a step', () => {
    expect(nextEmergencyStep('idle', 'confirm')).toBe('idle');
    expect(nextEmergencyStep('armed', 'confirm')).toBe('armed');
  });
  it('backing out returns to idle, but never un-does a finished unlock', () => {
    expect(nextEmergencyStep('confirming', 'cancel')).toBe('idle');
    expect(nextEmergencyStep('done', 'cancel')).toBe('done');
  });
});

describe('the wait with fractional seconds (ticked every 250 ms)', () => {
  const base = { posture: 'sealed' as const, reason: 'r', grace: false, appName: 'Scrollr', trigger: 'opened' as const, balance: 4, emergencyLeft: 1, clearsAt: '11:00' };
  it('shows whole seconds in the title and a smooth fill', () => {
    const vm = stormViewModel({ ...base, waitLeft: 37.25 });
    const wait = vm.doors.find((d) => d.key === 'wait')!;
    expect(wait.title).toBe('Breathe\u2026 0:37');
    expect(wait.fill).toBeCloseTo((60 - 37.25) / 60, 5);
  });
  it('ends on "That\'s a minute" only at exactly 0', () => {
    expect(stormViewModel({ ...base, waitLeft: 0.2 }).doors.find((d) => d.key === 'wait')!.title).toBe('Breathe\u2026 0:00');
    expect(stormViewModel({ ...base, waitLeft: 0 }).doors.find((d) => d.key === 'wait')!.title).toBe("That's a minute");
  });
});

describe('Clear skies on this screen', () => {
  it('says Clear skies and makes nobody wait: no doors, no emergency, just open the app', () => {
    const vm = stormViewModel({ posture: 'open', reason: "Sky's clear. Enjoy it.", grace: false, appName: 'Scrollr', trigger: 'opened', balance: 30, emergencyLeft: 1, clearsAt: null });
    expect(vm.mode).toBe('clear');
    expect(vm.weatherName).toBe('Clear skies');
    expect(vm.doors).toEqual([]);
    expect(vm.note).toBe('Nothing is restricted right now.');
    expect(vm.umbrella.note).toBe('Saved for when clouds roll in'); // not the Storm line
  });
});
