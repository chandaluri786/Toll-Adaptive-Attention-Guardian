// OWNER: C (task C9). Offline queue sync and pairing against a fake server: jest never touches the network.
import type { LedgerEvent } from '../../contracts';
import { createLedgerCloud, SYNC_BATCH, RETRY_MS, SYNCED_KEY, toWire, type FetchLike } from '../cloud';
import { createMemoryKV, type KV } from '../kv';

const URL = 'https://ledger.example';
const T0 = new Date(2026, 10, 15, 14, 0).getTime();

type Call = { url: string; method: string; body: unknown };

/** A fake ledger server with the real one's rules: idempotent on (walletId, id), 400 on extra fields. */
function fakeServer() {
  const rows = new Map<string, number>();
  const calls: Call[] = [];
  let down = false;
  const codes = new Map<string, string>();
  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (down) throw new Error('network down');
    const reply = (status: number, payload: unknown) => ({ ok: status < 300, status, json: async () => payload });
    if (url === `${URL}/events`) {
      const events = body.events as Record<string, unknown>[];
      if (events.length > 100 || events.some((e) => Object.keys(e).sort().join() !== 'at,deltaMinutes,id,walletId')) {
        return reply(400, { error: 'bad batch' });
      }
      let accepted = 0;
      for (const e of events) {
        const key = `${e.walletId}|${e.id}`;
        if (!rows.has(key)) {
          rows.set(key, e.deltaMinutes as number);
          accepted++;
        }
      }
      return reply(200, { accepted, duplicates: events.length - accepted });
    }
    if (url === `${URL}/pair`) {
      codes.set('123456', body.walletId);
      return reply(200, { code: '123456', expiresAt: Math.floor(T0 / 1000) + 300 });
    }
    return reply(404, { error: 'not found' });
  };
  return {
    fetch,
    calls,
    rows,
    codes,
    balance: () => [...rows.values()].reduce((a, b) => a + b, 0),
    setDown: (d: boolean) => (down = d),
  };
}

const ev = (id: string, deltaMinutes: number, extra: Partial<LedgerEvent> = {}): LedgerEvent => ({
  id,
  at: T0,
  deltaMinutes,
  category: 'spend',
  ...extra,
});

function setup(opts: { events?: LedgerEvent[]; kv?: KV; baseUrl?: string | null } = {}) {
  let events: LedgerEvent[] = opts.events ?? [];
  let now = T0;
  const server = fakeServer();
  const kv = opts.kv ?? createMemoryKV();
  const cloud = createLedgerCloud({
    kv,
    baseUrl: opts.baseUrl === undefined ? URL : opts.baseUrl,
    fetch: server.fetch,
    now: () => now,
    events: () => events,
    randomBytes: () => new Uint8Array(16).fill(0x5a),
  });
  return {
    cloud,
    server,
    kv,
    setEvents: (e: LedgerEvent[]) => (events = e),
    advance: (ms: number) => (now += ms),
  };
}

describe('toWire', () => {
  it('strips an event to exactly id, walletId, deltaMinutes, at', () => {
    const wire = toWire(ev('quest-q1', 25, { category: 'fitness', questId: 'q1' }), 'w-1');
    expect(wire).toEqual({ id: 'quest-q1', walletId: 'w-1', deltaMinutes: 25, at: T0 });
    expect(Object.keys(wire).sort()).toEqual(['at', 'deltaMinutes', 'id', 'walletId']);
  });
});

describe('sync', () => {
  it('sends pending events and remembers which ids were acknowledged', async () => {
    // Arrange
    const h = setup({ events: [ev('quest-a', 25, { category: 'fitness', questId: 'a' }), ev('spend-1', -5)] });

    // Act
    const first = await h.cloud.sync();
    const second = await h.cloud.sync();

    // Assert
    expect(first).toEqual({ status: 'synced', sent: 2 });
    expect(second).toEqual({ status: 'synced', sent: 0 });
    expect(h.server.calls).toHaveLength(1);
    expect(h.server.balance()).toBe(20);
    expect(h.cloud.pending()).toEqual([]);
    expect(JSON.parse(h.kv.getString(SYNCED_KEY) ?? '[]')).toEqual(['quest-a', 'spend-1']);
  });

  it('sends in batches of at most 100', async () => {
    const events = Array.from({ length: 2 * SYNC_BATCH + 5 }, (_, i) => ev(`spend-${i}`, -1));
    const h = setup({ events });

    const result = await h.cloud.sync();

    expect(SYNC_BATCH).toBe(100);
    expect(result).toEqual({ status: 'synced', sent: 205 });
    expect(h.server.calls.map((c) => (c.body as { events: unknown[] }).events.length)).toEqual([100, 100, 5]);
  });

  it('keeps events queued while offline, then sends them once the network is back', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });
    h.server.setDown(true);

    const offline = await h.cloud.sync();
    h.server.setDown(false);
    h.setEvents([ev('spend-1', -5), ev('spend-2', -3)]);
    const online = await h.cloud.sync();

    expect(offline).toEqual({ status: 'waiting', sent: 0 });
    expect(online).toEqual({ status: 'synced', sent: 2 });
    expect(h.server.balance()).toBe(-8);
  });

  it('a lost reply means a resend, and the idempotent server still counts it once', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });
    const real = h.server.fetch;
    let dropReply = true;
    const lossy: FetchLike = async (url, init) => {
      const res = await real(url, init);
      if (dropReply) {
        dropReply = false;
        throw new Error('reply lost');
      }
      return res;
    };
    const cloud = createLedgerCloud({ kv: h.kv, baseUrl: URL, fetch: lossy, now: () => T0, events: () => [ev('spend-1', -5)] });

    await cloud.sync();
    await cloud.sync();

    expect(h.server.calls).toHaveLength(2);
    expect(h.server.balance()).toBe(-5);
    expect(cloud.pending()).toEqual([]);
  });

  it('a rejected batch stays queued and never breaks the local ledger', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });
    const rejecting: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const cloud = createLedgerCloud({ kv: h.kv, baseUrl: URL, fetch: rejecting, now: () => T0, events: () => [ev('spend-1', -5)] });

    await expect(cloud.sync()).resolves.toEqual({ status: 'waiting', sent: 0 });
    expect(cloud.pending()).toHaveLength(1);
  });

  it('skips events the server could never take (bad id), so one cannot block the queue', async () => {
    const h = setup({ events: [ev('bad id with spaces', -1), ev('spend-1', -5), ev('spend-frac', 2.5)] });

    const result = await h.cloud.sync();

    expect(result).toEqual({ status: 'synced', sent: 1 });
    expect(h.server.balance()).toBe(-5);
  });

  it('rounds a fractional timestamp to whole milliseconds', () => {
    expect(toWire(ev('spend-1', -5, { at: T0 + 0.4 }), 'w').at).toBe(T0);
  });

  it('forgets acknowledged ids that are no longer in the ledger (pruned days)', async () => {
    const h = setup({ events: [ev('spend-1', -5), ev('spend-2', -3)] });
    await h.cloud.sync();
    h.setEvents([ev('spend-2', -3), ev('spend-3', -1)]);

    await h.cloud.sync();

    expect(JSON.parse(h.kv.getString(SYNCED_KEY) ?? '[]')).toEqual(['spend-2', 'spend-3']);
  });

  it('is off when no URL is configured: nothing is sent', async () => {
    const h = setup({ events: [ev('spend-1', -5)], baseUrl: null });

    expect(await h.cloud.sync()).toEqual({ status: 'off', sent: 0 });
    expect(h.server.calls).toHaveLength(0);
  });

  it('ignores a corrupt acknowledged list', async () => {
    const kv = createMemoryKV();
    kv.set(SYNCED_KEY, '{nope');
    const h = setup({ kv, events: [ev('spend-1', -5)] });

    expect(await h.cloud.sync()).toEqual({ status: 'synced', sent: 1 });
  });
});

describe('kick and retry', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('kick coalesces: a change during a sync triggers one more pass, not a pile-up', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });

    h.cloud.kick();
    h.setEvents([ev('spend-1', -5), ev('spend-2', -3)]);
    h.cloud.kick();
    h.cloud.kick();
    await flush();
    await flush();

    expect(h.server.calls).toHaveLength(2);
    expect(h.server.balance()).toBe(-8);
  });

  it('retry waits RETRY_MS after a miss, and does nothing with an empty queue', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });
    h.server.setDown(true);
    await h.cloud.sync();
    h.server.setDown(false);

    h.cloud.retry();
    await flush();
    const tooSoon = h.server.calls.length;
    h.advance(RETRY_MS);
    h.cloud.retry();
    await flush();
    await flush();
    const afterWait = h.server.calls.length;
    h.advance(RETRY_MS);
    h.cloud.retry();
    await flush();

    expect(tooSoon).toBe(1);
    expect(afterWait).toBe(2);
    expect(h.server.calls).toHaveLength(2); // queue empty: no call
  });

  it('a kick never rejects, even when fetch throws synchronously', async () => {
    const cloud = createLedgerCloud({
      kv: createMemoryKV(),
      baseUrl: URL,
      fetch: () => {
        throw new Error('boom');
      },
      now: () => T0,
      events: () => [ev('spend-1', -5)],
    });

    expect(() => cloud.kick()).not.toThrow();
    await expect(cloud.sync()).resolves.toEqual({ status: 'waiting', sent: 0 });
  });
});

describe('pairing', () => {
  it('requests a code for this wallet; expiresAt comes back in milliseconds', async () => {
    const h = setup();

    const code = await h.cloud.requestPairCode();

    expect(code).toEqual({ code: '123456', expiresAt: (Math.floor(T0 / 1000) + 300) * 1000 });
    expect(h.server.codes.get('123456')).toBe(h.cloud.walletId());
    expect(h.server.calls[0].body).toEqual({ walletId: h.cloud.walletId() });
  });

  it('is null when offline, when off, or when the reply is malformed', async () => {
    const offline = setup();
    offline.server.setDown(true);
    const off = setup({ baseUrl: null });
    const garbled: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ code: 12 }) });
    const bad = createLedgerCloud({ kv: createMemoryKV(), baseUrl: URL, fetch: garbled, now: () => T0, events: () => [] });

    expect(await offline.cloud.requestPairCode()).toBeNull();
    expect(await off.cloud.requestPairCode()).toBeNull();
    expect(await bad.requestPairCode()).toBeNull();
  });

  it('forget mints a new wallet and clears the acknowledged ids', async () => {
    const h = setup({ events: [ev('spend-1', -5)] });
    await h.cloud.sync();
    const before = h.cloud.walletId();

    h.cloud.forget();

    expect(h.kv.getString(SYNCED_KEY)).toBeUndefined();
    expect(h.cloud.pending()).toHaveLength(1);
    expect(h.cloud.walletId()).toBe(before); // same fixed random bytes in this harness
  });
});
