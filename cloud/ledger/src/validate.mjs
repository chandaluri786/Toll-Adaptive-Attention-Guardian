// Boundary validation. Only id, walletId, deltaMinutes and at may cross into the ledger;
// any other field (category, questId, app names...) is rejected, not silently dropped.
export const MAX_BATCH = 100;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_ABS_DELTA = 100_000;
const MAX_ID_LENGTH = 128;
const ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ['id', 'walletId', 'deltaMinutes', 'at'];

const fail = (error) => ({ ok: false, error });

export const parseWalletId = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value)
    ? { ok: true, walletId: value }
    : fail('walletId must be a UUID');

/** Optional `prefix` query parameter for GET /events: absent means every event. */
export const parseIdPrefix = (value) => {
  if (value === undefined) return { ok: true, prefix: '' };
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value)
    ? { ok: true, prefix: value }
    : fail(`prefix must be 1-${MAX_ID_LENGTH} characters of A-Z a-z 0-9 . _ : -`);
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const checkEvent = (raw, index) => {
  const where = `events[${index}]`;
  if (!isObject(raw)) return `${where} must be an object`;
  const extra = Object.keys(raw).filter((key) => !FIELDS.includes(key));
  if (extra.length > 0) return `${where} has fields the ledger does not accept: ${extra.join(', ')}`;
  const { id, walletId, deltaMinutes, at } = raw;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) {
    return `${where}.id must be 1-${MAX_ID_LENGTH} characters of A-Z a-z 0-9 . _ : -`;
  }
  if (!parseWalletId(walletId).ok) return `${where}.walletId must be a UUID`;
  if (!Number.isInteger(deltaMinutes) || Math.abs(deltaMinutes) > MAX_ABS_DELTA) {
    return `${where}.deltaMinutes must be a whole number between -${MAX_ABS_DELTA} and ${MAX_ABS_DELTA}`;
  }
  if (!Number.isSafeInteger(at) || at <= 0) return `${where}.at must be a positive whole number of milliseconds`;
  return null;
};

export const parseEventBatch = (rawBody) => {
  if (typeof rawBody !== 'string' || rawBody.length === 0) return fail('body must be JSON: { "events": [...] }');
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return fail(`body must be at most ${MAX_BODY_BYTES} bytes`);
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return fail('body must be JSON: { "events": [...] }');
  }
  if (!isObject(parsed) || !Array.isArray(parsed.events)) return fail('body must be JSON: { "events": [...] }');
  const { events } = parsed;
  if (events.length === 0 || events.length > MAX_BATCH) return fail(`events must hold 1-${MAX_BATCH} items`);
  for (const [index, raw] of events.entries()) {
    const error = checkEvent(raw, index);
    if (error) return fail(error);
  }
  return {
    ok: true,
    events: events.map(({ id, walletId, deltaMinutes, at }) => ({ id, walletId, deltaMinutes, at })),
  };
};

// Pairing bodies: exactly { walletId } for /pair and exactly { code } for /pair/claim.
export const MAX_PAIR_BODY_BYTES = 1024;
const CODE_PATTERN = /^\d{6}$/;

const parseSingleField = (rawBody, field) => {
  const shape = `body must be JSON: { "${field}": ... }`;
  if (typeof rawBody !== 'string' || rawBody.length === 0) return fail(shape);
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_PAIR_BODY_BYTES) return fail(`body must be at most ${MAX_PAIR_BODY_BYTES} bytes`);
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return fail(shape);
  }
  if (!isObject(parsed)) return fail(shape);
  const extra = Object.keys(parsed).filter((key) => key !== field);
  if (extra.length > 0) return fail(`body has fields pairing does not accept: ${extra.join(', ')}`);
  return { ok: true, value: parsed[field] };
};

export const parsePairRequest = (rawBody) => {
  const body = parseSingleField(rawBody, 'walletId');
  return body.ok ? parseWalletId(body.value) : body;
};

export const parseClaimRequest = (rawBody) => {
  const body = parseSingleField(rawBody, 'code');
  if (!body.ok) return body;
  return typeof body.value === 'string' && CODE_PATTERN.test(body.value)
    ? { ok: true, code: body.value }
    : fail('code must be six digits');
};
