// OWNER: C (task C9). Local-first sync of the ledger to cloud/ledger, plus the pairing request.
// Only id, walletId, deltaMinutes and at ever leave the phone (the server 400s on anything else).
// Each pass pushes unacknowledged events, then pulls `ext-` events (spends made off the phone, e.g. a
// laptop) and hands them to the ledger's absorb(), so the phone's balance and the server's agree.
// The ledger never waits on this: every network problem just leaves events queued for the next try.
import type { LedgerEvent } from '../contracts';
import { readJson, type KV } from './kv';
import { forgetWallet, walletIdOf, type RandomBytes } from './wallet';

export const SYNCED_KEY = 'synced';
/** Ids of events made anywhere but this phone start with this; the phone pulls exactly those. */
export const PULL_PREFIX = 'ext-';
export const SYNC_BATCH = 100;
/** After a miss, a clock tick tries again only this long after the last attempt. */
export const RETRY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MS_PER_SEC = 1000;
// Mirrors cloud/ledger/src/validate.mjs, so an event the server could never take can't block the queue.
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_ABS_DELTA = 100_000;

export type WireEvent = { id: string; walletId: string; deltaMinutes: number; at: number };
export type RemoteEvent = { id: string; deltaMinutes: number; at: number };
export type FetchInit = { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: unknown };
export type FetchLike = (
  url: string,
  init: FetchInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
/** synced: nothing left to send · waiting: try again later · off: no server configured. received = events absorbed. */
export type SyncResult = { status: 'synced' | 'waiting' | 'off'; sent: number; received: number };
/** A 6-digit code the laptop types in; expiresAt in epoch milliseconds. */
export type PairCode = { code: string; expiresAt: number };

export type CloudDeps = {
  kv: KV;
  baseUrl: string | null;
  fetch?: FetchLike;
  /** The ledger's clock (only used to space out retries). */
  now: () => number;
  /** The ledger's current events. */
  events: () => readonly LedgerEvent[];
  /** Merge pulled events into the ledger; returns how many were new. Without it, sync only pushes. */
  absorb?: (events: readonly RemoteEvent[]) => number;
  randomBytes?: RandomBytes;
};

export const toWire = (e: LedgerEvent, walletId: string): WireEvent => ({
  id: e.id,
  walletId,
  deltaMinutes: e.deltaMinutes,
  at: Math.round(e.at),
});

const isWireable = (w: WireEvent) =>
  ID_PATTERN.test(w.id) &&
  Number.isInteger(w.deltaMinutes) &&
  Math.abs(w.deltaMinutes) <= MAX_ABS_DELTA &&
  Number.isSafeInteger(w.at) &&
  w.at > 0;

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const defaultFetch: FetchLike | undefined = (globalThis as { fetch?: FetchLike }).fetch?.bind(globalThis);

type AbortLike = { signal: unknown; abort(): void };

/** A request with a timeout; resolves to the parsed body on 2xx, null on anything else (never throws). */
async function request(fetch: FetchLike, url: string, payload?: unknown): Promise<unknown | null> {
  const Ctl = (globalThis as { AbortController?: new () => AbortLike }).AbortController;
  const ctl = Ctl ? new Ctl() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: ctl?.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const isRemoteEvent = (e: unknown): e is RemoteEvent => {
  const v = e as Record<string, unknown> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    v.id.startsWith(PULL_PREFIX) &&
    Number.isFinite(v.deltaMinutes) &&
    Number.isFinite(v.at)
  );
};

/** The `events` of a GET /events reply, well-formed entries only; null when the reply isn't that shape. */
function parsePulled(reply: unknown): RemoteEvent[] | null {
  const events = (reply as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  return events.filter(isRemoteEvent).map(({ id, deltaMinutes, at }) => ({ id, deltaMinutes, at }));
}

function readSynced(kv: KV): Set<string> {
  const raw = readJson(kv, SYNCED_KEY);
  return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
}

export function createLedgerCloud({ kv, baseUrl, fetch = defaultFetch, now, events, absorb, randomBytes }: CloudDeps) {
  const isOn = baseUrl !== null && fetch !== undefined;
  let synced = readSynced(kv);
  let lastAttempt: number | null = null;
  let inFlight: Promise<SyncResult> | null = null;
  let again = false;

  const walletId = () => walletIdOf(kv, randomBytes);

  /** Remember acknowledged ids, keeping only those still in the ledger (pruned days drop out). */
  const remember = (ids: readonly string[]) => {
    const live = new Set(events().map((e) => e.id));
    synced = new Set([...synced, ...ids].filter((id) => live.has(id)));
    kv.set(SYNCED_KEY, JSON.stringify([...synced]));
  };

  const pending = (): WireEvent[] => {
    const wallet = walletId();
    return events()
      .filter((e) => !synced.has(e.id))
      .map((e) => toWire(e, wallet))
      .filter(isWireable);
  };

  /** Pull spends made off the phone. They are already on the server, so mark them acknowledged first. */
  const pull = async (): Promise<number | null> => {
    if (!absorb || !fetch) return 0;
    const query = `walletId=${encodeURIComponent(walletId())}&prefix=${encodeURIComponent(PULL_PREFIX)}`;
    const pulled = parsePulled(await request(fetch, `${baseUrl}/events?${query}`));
    if (pulled === null) return null;
    const known = new Set(events().map((e) => e.id));
    const fresh = pulled.filter((e) => !known.has(e.id));
    if (fresh.length === 0) return 0;
    synced = new Set([...synced, ...fresh.map((e) => e.id)]); // before absorb, whose change event kicks a push
    const received = absorb(fresh);
    remember([]);
    return received;
  };

  const sync = async (): Promise<SyncResult> => {
    if (!isOn) return { status: 'off', sent: 0, received: 0 };
    lastAttempt = now();
    let sent = 0;
    for (const batch of chunks(pending(), SYNC_BATCH)) {
      const reply = await request(fetch, `${baseUrl}/events`, { events: batch });
      if (reply === null) return { status: 'waiting', sent, received: 0 };
      remember(batch.map((e) => e.id)); // accepted or duplicate: the server has it either way
      sent += batch.length;
    }
    if (sent === 0) remember([]);
    const received = await pull();
    return received === null ? { status: 'waiting', sent, received: 0 } : { status: 'synced', sent, received };
  };

  /** Fire-and-forget sync. A kick during a sync runs one more pass afterwards instead of piling up. */
  const kick = (): void => {
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = sync()
      .catch((): SyncResult => ({ status: 'waiting', sent: 0, received: 0 }))
      .finally(() => {
        inFlight = null;
        if (again) {
          again = false;
          kick();
        }
      });
  };

  /** Clock-tick pass (push what's queued, pull what's new): not sooner than RETRY_MS after the last one. */
  const retry = (): void => {
    if (!isOn || inFlight) return;
    if (!absorb && pending().length === 0) return;
    const t = now();
    const isDue = lastAttempt === null || t - lastAttempt >= RETRY_MS || t < lastAttempt; // t < last: demo clock moved back
    if (isDue) kick();
  };

  /** Ask the server for a 6-digit code the laptop can claim. Null when off or offline. */
  const requestPairCode = async (): Promise<PairCode | null> => {
    if (!isOn) return null;
    const reply = (await request(fetch, `${baseUrl}/pair`, { walletId: walletId() })) as Record<string, unknown> | null;
    if (typeof reply?.code !== 'string' || !/^\d{6}$/.test(reply.code) || !Number.isFinite(reply.expiresAt)) return null;
    return { code: reply.code, expiresAt: (reply.expiresAt as number) * MS_PER_SEC };
  };

  /** A fresh start (demo "reset"): new wallet, nothing acknowledged, so old server rows never mix in. */
  const forget = (): void => {
    forgetWallet(kv);
    kv.remove(SYNCED_KEY);
    synced = new Set();
    lastAttempt = null;
  };

  return { walletId, pending, sync, kick, retry, requestPairCode, forget };
}

export type LedgerCloud = ReturnType<typeof createLedgerCloud>;
