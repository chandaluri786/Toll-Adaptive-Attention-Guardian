// In-memory stand-in for the DynamoDB store, same interface as src/dynamo.mjs.
export const createMemoryStore = () => {
  const rows = new Map(); // `${walletId}|${eventId}` -> row
  return {
    rows,
    async putIfAbsent(row) {
      const key = `${row.walletId}|${row.eventId}`;
      if (rows.has(key)) return false;
      rows.set(key, { ...row });
      return true;
    },
    async eventsFor(walletId, prefix = '') {
      return [...rows.values()]
        .filter((r) => r.walletId === walletId && r.eventId.startsWith(prefix))
        .map(({ eventId, deltaMinutes, at }) => ({ id: eventId, deltaMinutes, at }));
    },
    async deltasFor(walletId) {
      return [...rows.values()].filter((r) => r.walletId === walletId).map((r) => r.deltaMinutes);
    },
  };
};
