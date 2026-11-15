// OWNER: B (Spec B — task B10, P1). Asks cloud/quiz for the day's question pools: one POST with
// every study topic, `{topics}` and nothing else (no wallet id, no task names). Each pool is
// schema-checked here; bad or missing topics get one retry, then come back as `missing` and the
// study task falls back to a focus session.
import { cleanTopics, topicKey, validatePool, type QuizQuestion } from './quiz';

export type QuizFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: unknown },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type QuizRequestDeps = { baseUrl: string; fetch: QuizFetch; timeoutMs?: number };
/** pools: topic (as asked) → 9 valid questions. missing: topics to verify by focus instead. */
export type PoolResult = { pools: Record<string, QuizQuestion[]>; missing: string[] };

/** Bedrock makes one pool per topic in parallel; API Gateway gives up at 30 s. */
const DEFAULT_TIMEOUT_MS = 35_000;
const ATTEMPTS = 2; // the first try + one retry

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error('quiz request timed out'));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** One POST; returns the valid pools by topic key, or {} on any network/HTTP/JSON problem. */
async function postOnce(topics: string[], deps: QuizRequestDeps): Promise<Map<string, QuizQuestion[]>> {
  const found = new Map<string, QuizQuestion[]>();
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const res = await withTimeout(
      deps.fetch(`${deps.baseUrl}/quiz`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topics }),
        ...(abort ? { signal: abort.signal } : {}),
      }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      () => abort?.abort(),
    );
    if (!res.ok) return found;
    const body = await res.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return found;
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const pool = validatePool(value);
      if (pool) found.set(topicKey(key), pool);
    }
  } catch {
    // Offline, timed out or garbled: the caller retries once, then falls back to focus.
  }
  return found;
}

export async function requestQuizPools(rawTopics: readonly string[], deps: QuizRequestDeps): Promise<PoolResult> {
  const topics = cleanTopics(rawTopics);
  const pools: Record<string, QuizQuestion[]> = {};
  let missing = topics;
  for (let attempt = 0; attempt < ATTEMPTS && missing.length > 0; attempt++) {
    const found = await postOnce(missing, deps);
    for (const t of missing) {
      const pool = found.get(topicKey(t));
      if (pool) pools[t] = pool;
    }
    missing = missing.filter((t) => !(t in pools));
  }
  return { pools, missing };
}
