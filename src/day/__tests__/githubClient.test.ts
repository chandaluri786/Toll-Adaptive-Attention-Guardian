import { countCommits, type GithubFetch, type GithubResponse } from '../github-client';
import { formatGithubTarget, parseGithubTarget, validateGithubTarget } from '../github';

type Call = { url: string; headers: Record<string, string> };

function fakeFetch(res: Partial<GithubResponse> & { body?: unknown; headerMap?: Record<string, string> }) {
  const calls: Call[] = [];
  const fetch: GithubFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const headers = res.headerMap ?? {};
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => res.body,
    };
  };
  return { fetch, calls };
}

describe('GitHub targets', () => {
  test('accepts a username or owner/repo, and trims pasted links and @', () => {
    // Act / Assert
    expect(parseGithubTarget('octocat')).toEqual({ kind: 'user', user: 'octocat' });
    expect(parseGithubTarget('  @octocat ')).toEqual({ kind: 'user', user: 'octocat' });
    expect(parseGithubTarget('octo-cat/hello.world_1')).toEqual({ kind: 'repo', owner: 'octo-cat', repo: 'hello.world_1' });
    expect(parseGithubTarget('https://github.com/octocat/Hello-World')).toEqual({ kind: 'repo', owner: 'octocat', repo: 'Hello-World' });
    expect(parseGithubTarget('github.com/octocat/Hello-World.git/')).toEqual({ kind: 'repo', owner: 'octocat', repo: 'Hello-World' });
    expect(parseGithubTarget('github.com/octocat')).toEqual({ kind: 'user', user: 'octocat' });
  });

  test('rejects anything that is not a GitHub name', () => {
    // Act / Assert
    for (const bad of ['', '   ', '-octo', 'octo-', 'oc--to', 'a'.repeat(40), 'octo/..', 'octo/', 'a/b/c', 'octo cat', 'octo?x=1', 'gitlab.com/a/b', 'octo/re po']) {
      expect(parseGithubTarget(bad)).toBeNull();
    }
  });

  test('validation gives a calm hint, and the stored form is user or owner/repo', () => {
    // Act / Assert
    expect(validateGithubTarget('octo cat')).toBe('Use a GitHub username, or owner/repo');
    expect(validateGithubTarget('octocat')).toBeNull();
    expect(formatGithubTarget({ kind: 'user', user: 'octocat' })).toBe('octocat');
    expect(formatGithubTarget({ kind: 'repo', owner: 'octocat', repo: 'hi' })).toBe('octocat/hi');
  });
});

describe('countCommits', () => {
  test('a repo: reads the count from the last page of a one-per-page commit list', async () => {
    // Arrange
    const { fetch, calls } = fakeFetch({
      body: [{ sha: 'x' }],
      headerMap: { link: '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=4567>; rel="last"' },
    });
    // Act
    const r = await countCommits('octocat/Hello-World', { fetch });
    // Assert
    expect(r).toEqual({ ok: true, count: 4567 });
    expect(calls[0].url).toBe('https://api.github.com/repos/octocat/Hello-World/commits?per_page=1');
  });

  test('a repo with one commit (no paging) counts the list; an empty repo counts 0', async () => {
    // Act
    const one = await countCommits('a/b', fakeFetch({ body: [{ sha: 'x' }] }));
    const empty = await countCommits('a/b', fakeFetch({ ok: false, status: 409, body: { message: 'Git Repository is empty.' } }));
    // Assert
    expect(one).toEqual({ ok: true, count: 1 });
    expect(empty).toEqual({ ok: true, count: 0 });
  });

  test('a user: total_count from the public commit search', async () => {
    // Arrange
    const { fetch, calls } = fakeFetch({ body: { total_count: 312, incomplete_results: false, items: [] } });
    // Act
    const r = await countCommits('octocat', { fetch });
    // Assert
    expect(r).toEqual({ ok: true, count: 312 });
    expect(calls[0].url).toBe('https://api.github.com/search/commits?q=author%3Aoctocat&per_page=1');
  });

  test('privacy: no token or sign-in header; only the name is in the request', async () => {
    // Arrange
    const { fetch, calls } = fakeFetch({ body: { total_count: 1 } });
    // Act
    await countCommits('octocat', { fetch });
    // Assert
    const keys = Object.keys(calls[0].headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(keys).not.toContain('cookie');
    expect(calls[0].headers).toEqual({ accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' });
  });

  test('unknown user or repo → not_found (404 repo, 422 search)', async () => {
    // Act / Assert
    expect(await countCommits('a/b', fakeFetch({ ok: false, status: 404 }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await countCommits('ghost', fakeFetch({ ok: false, status: 422 }))).toEqual({ ok: false, reason: 'not_found' });
  });

  test('rate limits: 403 with no requests left gives the reset time; 429 gives retry-after', async () => {
    // Act
    const limited = await countCommits('a/b', fakeFetch({ ok: false, status: 403, headerMap: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } }));
    const slow = await countCommits('a/b', fakeFetch({ ok: false, status: 429, headerMap: { 'retry-after': '120' } }));
    const forbidden = await countCommits('a/b', fakeFetch({ ok: false, status: 403 }));
    // Assert
    expect(limited).toEqual({ ok: false, reason: 'rate_limited', resetAt: 1_800_000_000_000 });
    expect(slow).toEqual({ ok: false, reason: 'rate_limited', retryAfterMs: 120_000 });
    expect(forbidden).toEqual({ ok: false, reason: 'error' });
  });

  test('offline, timeouts, server errors and garbled answers never throw', async () => {
    // Arrange
    const offline: GithubFetch = async () => {
      throw new TypeError('Network request failed');
    };
    const hang: GithubFetch = () => new Promise(() => {});
    // Act / Assert
    expect(await countCommits('a/b', { fetch: offline })).toEqual({ ok: false, reason: 'offline' });
    expect(await countCommits('a/b', { fetch: hang, timeoutMs: 5 })).toEqual({ ok: false, reason: 'offline' });
    expect(await countCommits('a/b', fakeFetch({ ok: false, status: 502 }))).toEqual({ ok: false, reason: 'error' });
    expect(await countCommits('octocat', fakeFetch({ body: { total_count: -3 } }))).toEqual({ ok: false, reason: 'error' });
    expect(await countCommits('a/b', fakeFetch({ body: 'nope' }))).toEqual({ ok: false, reason: 'error' });
    expect(await countCommits('not a name', fakeFetch({ body: [] }))).toEqual({ ok: false, reason: 'not_found' });
  });
});
