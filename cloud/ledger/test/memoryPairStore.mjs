// In-memory stand-in for the DynamoDB pair store, same interface as src/pairStore.mjs.
export const createMemoryPairStore = () => {
  const rows = new Map(); // code -> { code, walletId, expiresAt }
  return {
    rows,
    async putIfAbsent(row) {
      if (rows.has(row.code)) return false;
      rows.set(row.code, { ...row });
      return true;
    },
    async take(code) {
      const row = rows.get(code) ?? null;
      rows.delete(code);
      return row;
    },
  };
};
