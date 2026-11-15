// Ledger logic over an injected store: { putIfAbsent(row) -> boolean, deltasFor(walletId) -> number[] }.
// A row is exactly { walletId, eventId, deltaMinutes, at }. Idempotent on (walletId, eventId): first write wins.
const toRow = ({ id, walletId, deltaMinutes, at }) => ({ walletId, eventId: id, deltaMinutes, at });

export const createLedgerService = (store) => ({
  async postEvents(events) {
    const results = await Promise.all(events.map((event) => store.putIfAbsent(toRow(event))));
    const accepted = results.filter(Boolean).length;
    return { accepted, duplicates: results.length - accepted };
  },
  async balance(walletId) {
    const deltas = await store.deltasFor(walletId);
    return deltas.reduce((sum, delta) => sum + delta, 0);
  },
});
