// OWNER: B (Spec B — task B11, P1). Reads one integer from GitHub's public REST API, no auth:
// - owner/repo → commits on the default branch (one per page; the "last" page number is the count)
// - username   → public commits they authored (commit search `total_count`)
// The request carries the name and nothing else: no token, no cookie, no device or wallet id.
// Never throws: offline, rate limits and odd answers come back as a calm reason.
import { parseGithubTarget } from './github';

export type GithubResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};
export type GithubFetch = (url: string, init: { method: 'GET'; headers: Record<string, string>; signal?: unknown }) => Promise<GithubResponse>;
export type GithubClientDeps = { fetch: GithubFetch; timeoutMs?: number };

export type CommitIssue = 'offline' | 'rate_limited' | 'not_found' | 'error';
export type CommitCount =
  | { ok: true; count: number }
  | { ok: false; reason: Exclude<CommitIssue, 'rate_limited'> }
  | { ok: false; reason: 'rate_limited'; resetAt?: number; retryAfterMs?: number };

const API = 'https://api.github.com';
const HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
const DEFAULT_TIMEOUT_MS = 15_000;
const LAST_PAGE = /[?&]page=(\d+)[^>]*>;\s*rel="last"/;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function urlFor(target: string): string | null {
  const t = parseGithubTarget(target);
  if (!t) return null;
  if (t.kind === 'repo') return `${API}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/commits?per_page=1`;
  return `${API}/search/commits?q=${encodeURIComponent(`author:${t.user}`)}&per_page=1`;
}

function rateLimit(res: GithubResponse): CommitCount | null {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return { ok: false, reason: 'rate_limited', retryAfterMs: retryAfter * 1000 };
  if (res.headers.get('x-ratelimit-remaining') !== '0') return null;
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  return Number.isFinite(reset) && reset > 0 ? { ok: false, reason: 'rate_limited', resetAt: reset * 1000 } : { ok: false, reason: 'rate_limited' };
}

async function readCount(res: GithubResponse, isRepo: boolean): Promise<CommitCount> {
  const body = await res.json();
  if (isRepo) {
    if (!Array.isArray(body)) return { ok: false, reason: 'error' };
    const last = LAST_PAGE.exec(res.headers.get('link') ?? '');
    const count = last ? Number(last[1]) : body.length;
    return isCount(count) ? { ok: true, count } : { ok: false, reason: 'error' };
  }
  const total = typeof body === 'object' && body !== null ? (body as { total_count?: unknown }).total_count : undefined;
  return isCount(total) ? { ok: true, count: total } : { ok: false, reason: 'error' };
}

async function interpret(res: GithubResponse, isRepo: boolean): Promise<CommitCount> {
  if (res.ok) return readCount(res, isRepo);
  if (res.status === 409 && isRepo) return { ok: true, count: 0 }; // empty repository
  if (res.status === 404 || res.status === 422) return { ok: false, reason: 'not_found' };
  if (res.status === 403 || res.status === 429) return rateLimit(res) ?? { ok: false, reason: 'error' };
  return { ok: false, reason: 'error' };
}

function timeout(ms: number, onTimeout: () => void): { promise: Promise<'timeout'>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      onTimeout();
      resolve('timeout');
    }, ms);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

/** The commit count for a username or owner/repo, or why it couldn't be read right now. */
export async function countCommits(target: string, deps: GithubClientDeps): Promise<CommitCount> {
  const url = urlFor(target);
  if (!url) return { ok: false, reason: 'not_found' };
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const limit = timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => abort?.abort());
  try {
    const request = deps.fetch(url, { method: 'GET', headers: { ...HEADERS }, ...(abort ? { signal: abort.signal } : {}) });
    const res = await Promise.race([request, limit.promise]);
    if (res === 'timeout') return { ok: false, reason: 'offline' };
    return await interpret(res, url.includes('/repos/'));
  } catch (e) {
    // fetch rejects only when the network is down (or aborted); a bad body is a GitHub problem.
    return e instanceof SyntaxError ? { ok: false, reason: 'error' } : { ok: false, reason: 'offline' };
  } finally {
    limit.clear();
  }
}
