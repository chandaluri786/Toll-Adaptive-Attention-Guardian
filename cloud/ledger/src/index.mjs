// OWNER: C (Spec C — tasks C8, C9). Store only eventId, walletId, deltaMinutes, at.
export const handler = async (event) => {
  return { statusCode: 501, body: JSON.stringify({ error: `not implemented yet: ${event.routeKey}` }) };
};
