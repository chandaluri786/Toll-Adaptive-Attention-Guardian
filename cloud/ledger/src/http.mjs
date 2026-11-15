// HTTP API (payload v2) routing. Pure apart from the injected stores, clock and log.
import { parseClaimRequest, parseEventBatch, parseIdPrefix, parsePairRequest, parseWalletId } from './validate.mjs';
import { createLedgerService } from './ledger.mjs';
import { createPairingService } from './pairing.mjs';

const respond = (statusCode, payload) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

const bodyOf = (event) =>
  event.isBase64Encoded && typeof event.body === 'string'
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

export const createRouter = ({ store, pairStore, now = () => Date.now(), log = console }) => {
  const ledger = createLedgerService(store);
  const pairing = createPairingService({ store: pairStore, now });

  const routes = {
    'POST /events': async (event) => {
      const batch = parseEventBatch(bodyOf(event));
      if (!batch.ok) return respond(400, { error: batch.error });
      return respond(200, await ledger.postEvents(batch.events));
    },
    'GET /events': async (event) => {
      const wallet = parseWalletId(event.queryStringParameters?.walletId);
      if (!wallet.ok) return respond(400, { error: wallet.error });
      const prefix = parseIdPrefix(event.queryStringParameters?.prefix);
      if (!prefix.ok) return respond(400, { error: prefix.error });
      return respond(200, { walletId: wallet.walletId, events: await ledger.eventsFor(wallet.walletId, prefix.prefix) });
    },
    'GET /balance': async (event) => {
      const wallet = parseWalletId(event.queryStringParameters?.walletId);
      if (!wallet.ok) return respond(400, { error: wallet.error });
      return respond(200, { walletId: wallet.walletId, balanceMinutes: await ledger.balance(wallet.walletId) });
    },
    'POST /pair': async (event) => {
      const request = parsePairRequest(bodyOf(event));
      if (!request.ok) return respond(400, { error: request.error });
      return respond(200, await pairing.pair(request.walletId));
    },
    // Unknown, already used and expired codes all get the same 404, so a guess learns nothing more.
    'POST /pair/claim': async (event) => {
      const request = parseClaimRequest(bodyOf(event));
      if (!request.ok) return respond(400, { error: request.error });
      const claimed = await pairing.claim(request.code);
      if (!claimed) return respond(404, { error: 'that code is unknown or has expired; ask the phone for a new one' });
      return respond(200, claimed);
    },
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
