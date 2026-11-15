// Pairing logic over an injected store: { putIfAbsent(row) -> boolean, take(code) -> row | null }.
// A row is exactly { code, walletId, expiresAt } with expiresAt in epoch SECONDS (DynamoDB TTL).
// A code lives 5 minutes and works once: claim removes it, and checks expiry itself because TTL lags.
import { randomInt } from 'node:crypto';

export const PAIR_TTL_SEC = 5 * 60;
export const PAIR_RETRIES = 5;
const CODE_SPACE = 1_000_000;

export const randomPairCode = () => String(randomInt(0, CODE_SPACE)).padStart(6, '0');

export const createPairingService = ({ store, now = () => Date.now(), randomCode = randomPairCode }) => ({
  async pair(walletId) {
    const expiresAt = Math.floor(now() / 1000) + PAIR_TTL_SEC;
    for (let attempt = 0; attempt < PAIR_RETRIES; attempt++) {
      const code = randomCode();
      if (await store.putIfAbsent({ code, walletId, expiresAt })) return { code, expiresAt };
    }
    throw new Error('no free pairing code after retries');
  },
  /** The wallet for a live code (and the code is spent), or null for an unknown, used or expired one. */
  async claim(code) {
    const row = await store.take(code);
    if (!row || row.expiresAt <= now() / 1000) return null;
    return { walletId: row.walletId };
  },
});
