// HTTP API (payload v2) routing. Pure apart from the injected store and log.
import { parseEventBatch, parseWalletId } from './validate.mjs';
import { createLedgerService } from './ledger.mjs';

const respond = (statusCode, payload) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

const bodyOf = (event) =>
  event.isBase64Encoded && typeof event.body === 'string'
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

export const createRouter = ({ store, log = console }) => {
  const ledger = createLedgerService(store);

  const routes = {
    'POST /events': async (event) => {
      const batch = parseEventBatch(bodyOf(event));
      if (!batch.ok) return respond(400, { error: batch.error });
      return respond(200, await ledger.postEvents(batch.events));
    },
    'GET /balance': async (event) => {
      const wallet = parseWalletId(event.queryStringParameters?.walletId);
      if (!wallet.ok) return respond(400, { error: wallet.error });
      return respond(200, { walletId: wallet.walletId, balanceMinutes: await ledger.balance(wallet.walletId) });
    },
    // C9 fills these in (see README "Pairing").
    'POST /pair': async () => respond(501, { error: 'pairing is not available yet' }),
    'POST /pair/claim': async () => respond(501, { error: 'pairing is not available yet' }),
  };

  return async (event) => {
    const route = routes[event?.routeKey];
    if (!route) return respond(404, { error: 'not found' });
    try {
      return await route(event);
    } catch (error) {
      log.error('ledger request failed', { routeKey: event.routeKey, error: String(error?.stack ?? error) });
      return respond(500, { error: 'something went wrong, try again' });
    }
  };
};
