// OWNER: C (task C9). The wallet id: a random UUID minted on first use and kept under `ledger:wallet`.
// It is the only identity the server ever sees (no accounts). The laptop learns it through pairing.
import { readJson, type KV } from './kv';

export const WALLET_KEY = 'wallet';
const UUID_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type RandomBytes = (n: number) => Uint8Array;

type CryptoLike = { getRandomValues?: (a: Uint8Array) => Uint8Array };

/** The platform's secure random source when it has one (Hermes, browsers, Node), else Math.random. */
export const platformRandomBytes: RandomBytes = (n) => {
  const out = new Uint8Array(n);
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof crypto?.getRandomValues === 'function') return crypto.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

/** RFC 4122 version-4 UUID from 16 random bytes. */
export function uuidFromBytes(raw: Uint8Array): string {
  const b = Array.from(raw.slice(0, UUID_BYTES));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This phone's wallet id, minted (and stored) the first time it is asked for. */
export function walletIdOf(kv: KV, randomBytes: RandomBytes = platformRandomBytes): string {
  const stored = readJson(kv, WALLET_KEY);
  if (typeof stored === 'string' && UUID_PATTERN.test(stored)) return stored;
  const id = uuidFromBytes(randomBytes(UUID_BYTES));
  kv.set(WALLET_KEY, JSON.stringify(id));
  return id;
}

/** Drop the wallet; the next walletIdOf mints a new one. */
export function forgetWallet(kv: KV): void {
  kv.remove(WALLET_KEY);
}
