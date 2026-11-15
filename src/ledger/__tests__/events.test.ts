// OWNER: C (task C5). Pure event rules: mint, cap, reset events, parsing.
import type { LedgerEvent } from '../../contracts';
import { DAILY_MINT_CAP } from '../economy';
import { balanceOn, mintFor, parseEvents, resetsDue } from '../events';
import { dayEnd } from '../time';

const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
const ev = (id: string, t: number, delta: number, category: LedgerEvent['category'] = 'fitness'): LedgerEvent => ({
  id,
  at: t,
  deltaMinutes: delta,
  category,
});

describe('mintFor', () => {
  it('is the earning table × rate, rounded', () => {
    expect(mintFor('coding', 1, 0)).toBe(20);
    expect(mintFor('study', 0.5, 0)).toBe(10);
    expect(mintFor('place', 0.25, 0)).toBe(6);
  });
  it('never passes the cap', () => {
    expect(DAILY_MINT_CAP).toBe(150);
    expect(mintFor('fitness', 1, 140)).toBe(10);
    expect(mintFor('fitness', 1, 150)).toBe(0);
    expect(mintFor('fitness', 1, 200)).toBe(0);
  });
});

describe('parseEvents', () => {
  it('keeps the first copy of an id and sorts by time', () => {
    const out = parseEvents([ev('b', 2, 5), ev('a', 1, 5), ev('a', 3, 99)]);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out[0].deltaMinutes).toBe(5);
  });
  it('anything not a list is empty', () => {
    expect(parseEvents({})).toEqual([]);
    expect(parseEvents(undefined)).toEqual([]);
  });
});

describe('resetsDue', () => {
  it('closes each past day with a non-zero sum at its last instant', () => {
    const events = [ev('a', at(14, 9), 25), ev('b', at(14, 10), -5, 'spend'), ev('c', at(15, 9), 15)];
    const due = resetsDue(events, '2026-11-16');
    expect(due).toEqual([
      { id: 'reset-2026-11-14', at: dayEnd('2026-11-14'), deltaMinutes: -20, category: 'reset' },
      { id: 'reset-2026-11-15', at: dayEnd('2026-11-15'), deltaMinutes: -15, category: 'reset' },
    ]);
    expect(balanceOn([...events, ...due], '2026-11-14')).toBe(0);
  });
  it('leaves today and already-closed days alone', () => {
    const events = [ev('a', at(14, 9), 25), ev('reset-2026-11-14', dayEnd('2026-11-14'), -25, 'reset'), ev('c', at(15, 9), 15)];
    expect(resetsDue(events, '2026-11-15')).toEqual([]);
  });
  it('a second close of the same day gets a fresh id', () => {
    const events = [ev('a', at(14, 9), 25), ev('reset-2026-11-14', dayEnd('2026-11-14'), -25, 'reset'), ev('b', at(14, 11), 10)];
    expect(resetsDue(events, '2026-11-15')[0].id).toBe('reset-2026-11-14-2');
  });
});
