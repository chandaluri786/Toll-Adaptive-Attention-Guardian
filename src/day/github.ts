// OWNER: B (Spec B — task B11, P1). Pure: the GitHub name a coding quest watches — a username or
// owner/repo. Pasted links and "@name" are tidied up; anything else is refused. Only this name is
// ever sent, and only to GitHub (./github-client.ts). No token, no sign-in.

export type GithubTarget = { kind: 'user'; user: string } | { kind: 'repo'; owner: string; repo: string };

/** GitHub logins: 1–39 letters, digits or single hyphens, no hyphen at either end. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
/** Repo names: letters, digits, '.', '_', '-', up to 100; never "." or "..". */
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const HOST_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

export const GITHUB_HINT = 'Use a GitHub username, or owner/repo';

/** "octocat", "@octocat", "octocat/hello", "https://github.com/octocat/hello(.git)" → a target. */
export function parseGithubTarget(raw: string): GithubTarget | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^@/, '');
  if (HOST_PREFIX.test(s)) s = s.replace(HOST_PREFIX, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const parts = s.split('/');
  if (parts.length === 1) return LOGIN.test(parts[0]) ? { kind: 'user', user: parts[0] } : null;
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!LOGIN.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  return { kind: 'repo', owner, repo };
}

/** The stored form: "octocat" or "octocat/hello". */
export const formatGithubTarget = (t: GithubTarget): string => (t.kind === 'user' ? t.user : `${t.owner}/${t.repo}`);

export const validateGithubTarget = (raw: string): string | null => (parseGithubTarget(raw) ? null : GITHUB_HINT);
