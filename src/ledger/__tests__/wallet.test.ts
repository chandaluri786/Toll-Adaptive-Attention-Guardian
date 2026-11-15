// OWNER: C (task C9). The wallet id: minted once on first use, kept under `ledger:`.
import { createMemoryKV } from '../kv';
import { forgetWallet, uuidFromBytes, walletIdOf, WALLET_KEY } from '../wallet';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bytes = (fill: number) => () => new Uint8Array(16).fill(fill);

describe('wallet id', () => {
  it('formats 16 random bytes as a version-4 UUID', () => {
    // Arrange
    const raw = new Uint8Array(16).fill(0xff);

    // Act
    const id = uuidFromBytes(raw);

    // Assert
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(id).toMatch(UUID_V4);
  });

  it('mints once on first use and stores it under ledger:', () => {
    const kv = createMemoryKV();

    const first = walletIdOf(kv, bytes(0x11));
    const second = walletIdOf(kv, bytes(0x22));

    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
    expect(kv.keys()).toEqual([`ledger:${WALLET_KEY}`]);
  });

  it('replaces a corrupt stored value with a fresh id', () => {
    const kv = createMemoryKV();
    kv.set(WALLET_KEY, '"not-a-uuid"');

    const id = walletIdOf(kv, bytes(0x33));

    expect(id).toMatch(UUID_V4);
    expect(walletIdOf(kv, bytes(0x44))).toBe(id);
  });

  it('uses the platform random source by default', () => {
    const kv = createMemoryKV();
    const a = walletIdOf(kv);
    forgetWallet(kv);
    const b = walletIdOf(kv);

    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});
