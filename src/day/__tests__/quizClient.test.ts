import type { QuizQuestion } from '../quiz';
import { requestQuizPools, type QuizFetch } from '../quiz-client';

const nine = (tag: string): QuizQuestion[] => Array.from({ length: 9 }, (_, i) => ({ q: `${tag} ${i}?`, options: ['a', 'b', 'c', 'd'], correct: 0 }));
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function fakeFetch(responses: (() => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>)[]) {
  const calls: { url: string; body: unknown }[] = [];
  const fetch: QuizFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = responses[calls.length - 1];
    if (!next) throw new Error('unexpected call');
    return next();
  };
  return { fetch, calls };
}

const BASE = 'https://quiz.example';

describe('requestQuizPools', () => {
  test('one POST to /quiz carrying every topic, and nothing else', async () => {
    const { fetch, calls } = fakeFetch([async () => ok({ Graphs: nine('g'), DP: nine('d') })]);

    const r = await requestQuizPools(['Graphs', 'DP'], { baseUrl: BASE, fetch });

    expect(calls).toEqual([{ url: `${BASE}/quiz`, body: { topics: ['Graphs', 'DP'] } }]);
    expect(Object.keys(r.pools)).toEqual(['Graphs', 'DP']);
    expect(r.pools.Graphs).toHaveLength(9);
    expect(r.missing).toEqual([]);
  });

  test('a topic with a malformed pool is retried once, alone', async () => {
    const bad = nine('d').slice(0, 8);
    const { fetch, calls } = fakeFetch([async () => ok({ Graphs: nine('g'), DP: bad }), async () => ok({ DP: nine('d2') })]);

    const r = await requestQuizPools(['Graphs', 'DP'], { baseUrl: BASE, fetch });

    expect(calls.map((c) => c.body)).toEqual([{ topics: ['Graphs', 'DP'] }, { topics: ['DP'] }]);
    expect(r.pools.DP[0].q).toBe('d2 0?');
    expect(r.missing).toEqual([]);
  });

  test('after the one retry, still-bad topics come back as missing (→ focus fallback)', async () => {
    const { fetch, calls } = fakeFetch([async () => ok({ Graphs: nine('g') }), async () => ok({ DP: 'nope' })]);

    const r = await requestQuizPools(['Graphs', 'DP'], { baseUrl: BASE, fetch });

    expect(calls).toHaveLength(2);
    expect(Object.keys(r.pools)).toEqual(['Graphs']);
    expect(r.missing).toEqual(['DP']);
  });

  test('a network error is retried once, then everything is missing', async () => {
    const { fetch, calls } = fakeFetch([
      async () => {
        throw new Error('offline');
      },
      async () => {
        throw new Error('offline');
      },
    ]);

    const r = await requestQuizPools(['Graphs'], { baseUrl: BASE, fetch });

    expect(calls).toHaveLength(2);
    expect(r).toEqual({ pools: {}, missing: ['Graphs'] });
  });

  test('a non-200 and then a good answer recovers', async () => {
    const { fetch } = fakeFetch([async () => ({ ok: false, status: 502, json: async () => ({}) }), async () => ok({ Graphs: nine('g') })]);

    const r = await requestQuizPools(['Graphs'], { baseUrl: BASE, fetch });

    expect(r.missing).toEqual([]);
  });

  test('response keys match topics regardless of case and spacing', async () => {
    const { fetch } = fakeFetch([async () => ok({ 'graph  ALGORITHMS': nine('g') })]);

    const r = await requestQuizPools(['Graph algorithms'], { baseUrl: BASE, fetch });

    expect(r.pools['Graph algorithms']).toHaveLength(9);
  });

  test('topics are cleaned and deduped before sending; none → no request', async () => {
    const { fetch, calls } = fakeFetch([async () => ok({ Graphs: nine('g') })]);

    await requestQuizPools([' Graphs ', 'graphs', ''], { baseUrl: BASE, fetch });
    const none = await requestQuizPools(['  '], { baseUrl: BASE, fetch });

    expect(calls[0].body).toEqual({ topics: ['Graphs'] });
    expect(calls).toHaveLength(1);
    expect(none).toEqual({ pools: {}, missing: [] });
  });

  test('a request that hangs is cut off by the timeout and retried', async () => {
    const { fetch, calls } = fakeFetch([() => new Promise(() => {}), async () => ok({ Graphs: nine('g') })]);

    const r = await requestQuizPools(['Graphs'], { baseUrl: BASE, fetch, timeoutMs: 10 });

    expect(calls).toHaveLength(2);
    expect(r.missing).toEqual([]);
  });
});
