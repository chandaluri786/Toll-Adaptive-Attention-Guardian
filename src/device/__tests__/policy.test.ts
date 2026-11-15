// OWNER: A (task A4). The 9-cell matrix from the planning doc, the windows rule, and the blocklist.
import type { AccessWindow, AppClass, Posture } from '../../contracts';
import { MIN } from '../../shared/emitter';
import { classify, computeBlocklist, isAllowed, windowCovers, type AppClassification } from '../policy';

const NOW = 1_000_000;
const config: AppClassification = {
  restricted: new Set(['com.instagram.android', 'com.google.android.youtube']),
  alwaysOpen: new Set(['com.whatsapp']),
  discretionary: new Set(),
};
const win = (scope: AccessWindow['scope'], until = NOW + 15 * MIN): AccessWindow => ({ id: 'w', scope, until, source: 'spend' });

describe('isAllowed — the 3 × 3 matrix', () => {
  // [class, posture] -> expectation
  const cases: [AppClass, Posture, string][] = [
    ['essential', 'open', 'allow'],
    ['essential', 'metered', 'allow'],
    ['essential', 'sealed', 'allow'],
    ['discretionary', 'open', 'allow'],
    ['discretionary', 'metered', 'allow-logged'],
    ['discretionary', 'sealed', 'intercept-spend-x2'],
    ['restricted', 'open', 'allow'],
    ['restricted', 'metered', 'intercept-spend'],
    ['restricted', 'sealed', 'intercept-quest-only'],
  ];

  it.each(cases)('%s under %s -> %s', (appClass, posture, expected) => {
    const d = isAllowed(appClass, posture, [], NOW);
    switch (expected) {
      case 'allow':
        expect(d).toEqual({ kind: 'allow', logged: false });
        break;
      case 'allow-logged':
        expect(d).toEqual({ kind: 'allow', logged: true });
        break;
      case 'intercept-spend':
        expect(d).toEqual({ kind: 'intercept', canSpend: true, spendRate: 1, questPrimary: false });
        break;
      case 'intercept-spend-x2':
        expect(d).toEqual({ kind: 'intercept', canSpend: true, spendRate: 2, questPrimary: false });
        break;
      case 'intercept-quest-only':
        // The Sealed rule: banked minutes cannot open a Restricted app in a Storm.
        expect(d).toEqual({ kind: 'intercept', canSpend: false, spendRate: 1, questPrimary: true });
        break;
    }
  });
});

describe('windows', () => {
  it('an open window lets a restricted app through, in Cloudy and in a Storm', () => {
    expect(isAllowed('restricted', 'metered', [win('restricted')], NOW).kind).toBe('allow');
    expect(isAllowed('restricted', 'sealed', [win('restricted')], NOW).kind).toBe('allow');
  });
  it('an emergency window (scope all) opens every class', () => {
    expect(isAllowed('discretionary', 'sealed', [win('all')], NOW).kind).toBe('allow');
  });
  it('an expired window does nothing', () => {
    expect(isAllowed('restricted', 'sealed', [win('restricted', NOW)], NOW).kind).toBe('intercept');
    expect(windowCovers(win('restricted', NOW - 1), 'restricted', NOW)).toBe(false);
  });
  it('a window for another class does not cover this one', () => {
    expect(isAllowed('restricted', 'metered', [win('discretionary')], NOW).kind).toBe('intercept');
  });
  it('a domain window (the laptop extension) never opens a phone app', () => {
    expect(isAllowed('restricted', 'metered', [win({ domain: 'instagram.com' })], NOW).kind).toBe('intercept');
  });
});

describe('classify', () => {
  it('the phone\'s safety apps are essential even if the user lists them as distracting', () => {
    const sneaky = { ...config, restricted: new Set(['com.google.android.dialer']) };
    expect(classify('com.google.android.dialer', sneaky)).toBe('essential');
  });
  it('the 2 chosen messaging apps are always open', () => {
    expect(classify('com.whatsapp', config)).toBe('essential');
  });
  it('restricted beats the discretionary defaults', () => {
    expect(classify('com.google.android.youtube', config)).toBe('restricted');
  });
  it('browser and email default to discretionary', () => {
    expect(classify('com.android.chrome', config)).toBe('discretionary');
  });
  it('an app we know nothing about is never blocked', () => {
    expect(classify('com.example.mystery', config)).toBe('essential');
  });
});

describe('computeBlocklist', () => {
  const installed = ['com.instagram.android', 'com.android.chrome', 'com.google.android.dialer', 'com.whatsapp'];
  it('is empty under clear skies', () => {
    expect(computeBlocklist('open', config, installed)).toEqual([]);
  });
  it('Cloudy blocks restricted apps only', () => {
    expect(computeBlocklist('metered', config, installed)).toEqual(['com.instagram.android']);
  });
  it('a Storm adds discretionary apps but never essential ones', () => {
    expect(computeBlocklist('sealed', config, installed)).toEqual(['com.instagram.android', 'com.android.chrome']);
  });
});
