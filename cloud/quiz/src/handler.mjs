// OWNER: B (B10). POST /quiz — body exactly { "topics": [...] } → { [topic]: Question[9] }.
// Stores nothing and logs no topics: only counts and timings go to CloudWatch.
import { cleanTopics, generateForTopic } from './quiz.mjs';

const MAX_BODY_BYTES = 2048;
/** A retry needs a whole model call; API Gateway gives up at 30 s. */
const RETRY_NEEDS_MS = 12_000;

const respond = (statusCode, payload) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

const bodyOf = (event) => (event.isBase64Encoded && typeof event.body === 'string' ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);

function parseRequest(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || Buffer.byteLength(raw) > MAX_BODY_BYTES) return { ok: false, error: 'body must be JSON under 2 KB' };
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'body must be JSON' };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'body must be { "topics": [...] }' };
  const extra = Object.keys(body).filter((k) => k !== 'topics');
  if (extra.length > 0) return { ok: false, error: 'only "topics" is accepted' };
  return cleanTopics(body.topics);
}

export const createHandler = ({ invoke, rng, log = console }) =>
  async function handler(event, context) {
    const req = parseRequest(bodyOf(event));
    if (!req.ok) return respond(400, { error: req.error });
    const started = Date.now();
    // Error name + message only: Bedrock's errors never echo the prompt, so no topic reaches the logs.
    const onError = (e) => log.error(`quiz: model call failed: ${e?.name ?? 'Error'}: ${e?.message ?? ''}`);
    const canRetry = () => (context?.getRemainingTimeInMillis?.() ?? 0) > RETRY_NEEDS_MS;
    const pools = await Promise.all(req.topics.map((topic) => generateForTopic(topic, { invoke, rng, canRetry, onError })));
    const result = Object.fromEntries(req.topics.flatMap((topic, i) => (pools[i] ? [[topic, pools[i]]] : [])));
    const made = Object.keys(result).length;
    log.log(`quiz: ${made}/${req.topics.length} topics in ${Date.now() - started} ms`);
    if (made === 0) return respond(502, { error: 'no questions could be made — try again' });
    return respond(200, result);
  };
