// OWNER: C (task C9). The wired ledger syncs on change and keeps working with the network down.
import type { Services } from '../../contracts';
import { createFakeDay } from '../../day/fakes';
import { createFakeDevice } from '../../device/fakes';
import { createFakeEngine } from '../../engine/fakes';
import type { FetchLike } from '../cloud';
import { createMemoryKV } from '../kv';
import { wireLedger } from '../wiring';

const URL = 'https://ledger.example';
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(fetch: FetchLike) {
  const services = {} as Services;
  const get = () => services;
  const engine = createFakeEngine();
  const kv = createMemoryKV();
  const ledger = wireLedger(get, kv, {}, { baseUrl: URL, fetch });
  Object.assign(services, engine.services, ledger.services, createFakeDevice(get).services, createFakeDay(get).services);
  return { ledger, services, kv };
}

describe('wired cloud sync', () => {
  it('sends a change to the server with only the four fields', async () => {
    // Arrange
    const bodies: unknown[] = [];
    const fetch: FetchLike = async (_url, init) => {
      if (init.body === undefined) return { ok: true, status: 200, json: async () => ({ events: [] }) };
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ accepted: 1, duplicates: 0 }) };
    };
    const h = harness(fetch);

    // Act
    h.services.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    await flush();
    await flush();

    // Assert
    const sent = bodies.flatMap((b) => (b as { events: Record<string, unknown>[] }).events);
    expect(sent.map((e) => e.id)).toContain('quest-q1');
    for (const e of sent) expect(Object.keys(e).sort()).toEqual(['at', 'deltaMinutes', 'id', 'walletId']);
    expect(h.ledger.cloud.pending()).toEqual([]);
    h.ledger.stop();
  });

  it('local spending works while the network is down', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('offline');
    };
    const h = harness(fetch);

    const credit = h.services.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    const spend = h.services.ledger.spend(5, 'all');
    await flush();

    expect(credit.event.deltaMinutes).toBeGreaterThan(0);
    expect(spend.ok).toBe(true);
    expect(h.ledger.cloud.pending().length).toBeGreaterThanOrEqual(2);
    h.ledger.stop();
  });

  it('a laptop spend on the server lowers the phone balance after a pass', async () => {
    let remote: { id: string; deltaMinutes: number; at: number }[] = [];
    const fetch: FetchLike = async (_url, init) =>
      init.body === undefined
        ? { ok: true, status: 200, json: async () => ({ events: remote }) }
        : { ok: true, status: 200, json: async () => ({ accepted: 0, duplicates: 0 }) };
    const h = harness(fetch);
    h.services.ledger.credit({ category: 'fitness', questId: 'q1', rate: 1 });
    await flush();
    const before = h.services.ledger.balance();
    remote = [{ id: 'ext-laptop-1', deltaMinutes: -6, at: h.services.clock.now() }];

    await h.ledger.cloud.sync();

    expect(h.services.ledger.balance()).toBe(before - 6);
    expect(h.ledger.cloud.pending().map((e) => e.id)).not.toContain('ext-laptop-1');
    h.ledger.stop();
  });

  it('demo reset starts a new wallet', () => {
    const h = harness(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const before = h.ledger.cloud.walletId();

    h.ledger.debug.reset();

    expect(h.ledger.cloud.walletId()).not.toBe(before);
    h.ledger.stop();
  });
});
