// OWNER: B (Spec B — task B11, P1). The quest engine's coding quests, kept apart from quests.ts:
// on accept, read the commit count for the user's GitHub name as the baseline; poll every 5 min
// while the quest is live; pass on any increase. Network trouble never fails a quest: it is
// noted on the watch, shown calmly, and retried (rate limits wait for GitHub's reset, ≤ 30 min).
import type { Verdict } from '../contracts';
import { MIN } from '../shared/emitter';
import { clockTime } from './format';
import type { CommitCount } from './github-client';
import type { CommitWatch, QuestRecord } from './quest-state';
import type { VerifyResult } from './quests';

/** Reads one commit count; ./github-client.ts `countCommits` in the app, a fake in tests. */
export type CommitCounter = (target: string) => Promise<CommitCount>;
/** What the sheet shows while a coding quest runs. */
export type CommitReadout = CommitWatch & { baseline: number | null };

export const COMMIT_POLL_MS = 5 * MIN;
const MAX_BACKOFF_MS = 30 * MIN;
/** "Verify now" trusts a read this recent; older ones are re-checked first. */
const FRESH_MS = 1 * MIN;

type CommitWatchDeps = {
  counter: CommitCounter | undefined;
  now: () => number;
  find: (questId: string) => QuestRecord | null;
  isLive: (r: QuestRecord) => boolean;
  liveRecords: () => QuestRecord[];
  /** Replace one record (immutably) and persist. */
  update: (questId: string, fn: (r: QuestRecord) => QuestRecord) => void;
  pass: (r: QuestRecord, v: Verdict) => VerifyResult;
  miss: (r: QuestRecord, v: Verdict) => VerifyResult;
};

const unavailable = (error: string): VerifyResult => ({ kind: 'unavailable', error });
const clamp = (ms: number) => Math.min(MAX_BACKOFF_MS, Math.max(COMMIT_POLL_MS, ms));

function backoffMs(result: Extract<CommitCount, { ok: false }>, now: number): number {
  if (result.reason !== 'rate_limited') return COMMIT_POLL_MS;
  if (result.retryAfterMs !== undefined) return clamp(result.retryAfterMs);
  return result.resetAt !== undefined ? clamp(result.resetAt - now) : MAX_BACKOFF_MS;
}

function commitVerdict(r: QuestRecord, latest: number): Verdict {
  const baseline = r.quest.baseline.commits ?? latest;
  const fresh = Math.max(0, latest - baseline);
  const target = r.quest.target;
  const where = r.github?.target ?? 'GitHub';
  return {
    questId: r.quest.id,
    pass: fresh >= target,
    method: 'commit_delta',
    reason: fresh >= target ? `New commit on ${where}` : `No new commits on ${where} yet — push one and it shows up here`,
    measured: `${Math.min(fresh, target)} of ${target} new commit${target === 1 ? '' : 's'}`,
    flags: [],
  };
}

/** A new watch for a coding quest accepted at `now`: the first read is due at once. */
export const newCommitWatch = (target: string, now: number): CommitWatch => ({ target, latest: null, checkedAt: null, nextPollAt: now, issue: null });

export function createCommitWatch(deps: CommitWatchDeps) {
  const inFlight = new Set<string>();

  function applyRead(questId: string, result: CommitCount) {
    const r = deps.find(questId);
    if (!r?.github || !deps.isLive(r)) return;
    const t = deps.now();
    if (!result.ok) {
      deps.update(questId, (x) => ({ ...x, github: { ...x.github!, checkedAt: t, issue: result.reason, nextPollAt: t + backoffMs(result, t) } }));
      return;
    }
    const old = r.quest.baseline.commits;
    // First good read = the baseline. A shrinking count (history rewritten) lowers it, so the
    // next real commit still counts as an increase.
    const baseline = old === undefined ? result.count : Math.min(old, result.count);
    deps.update(questId, (x) => ({
      ...x,
      quest: { ...x.quest, baseline: { ...x.quest.baseline, commits: baseline } },
      github: { ...x.github!, latest: result.count, checkedAt: t, issue: null, nextPollAt: t + COMMIT_POLL_MS },
    }));
    const fresh = deps.find(questId)!;
    const v = commitVerdict(fresh, result.count);
    if (v.pass) deps.pass(fresh, v);
  }

  /** One read for a live coding quest; a read already on its way is never doubled. */
  async function poll(questId: string): Promise<void> {
    const r = deps.find(questId);
    if (!deps.counter || !r?.github || !deps.isLive(r) || inFlight.has(questId)) return;
    inFlight.add(questId);
    let result: CommitCount;
    try {
      result = await deps.counter(r.github.target);
    } catch {
      result = { ok: false, reason: 'offline' };
    } finally {
      inFlight.delete(questId);
    }
    applyRead(questId, result);
  }

  /** Clock tick: read every live coding quest whose next check is due. */
  function pollDue() {
    const t = deps.now();
    deps
      .liveRecords()
      .filter((r) => r.quest.type === 'coding' && r.github && r.github.nextPollAt <= t)
      .forEach((r) => void poll(r.quest.id));
  }

  /** "Verify now": judge a fresh read; re-check a stale one first (the pass then arrives by itself). */
  function verify(r: QuestRecord): VerifyResult {
    const w = r.github;
    if (!w || !deps.counter) return unavailable("Coding quests aren't ready yet");
    const t = deps.now();
    if (w.issue === 'rate_limited' && t < w.nextPollAt) return unavailable(`GitHub needs a breather — next check at ${clockTime(w.nextPollAt)}`);
    if (w.checkedAt === null || t - w.checkedAt >= FRESH_MS) {
      void poll(r.quest.id);
      return unavailable('Checking GitHub now — give it a moment');
    }
    if (w.issue === 'not_found') return unavailable(`GitHub can't find ${w.target} — check the name in Settings → Planner`);
    if (w.issue !== null || w.latest === null) return unavailable("Can't reach GitHub right now — we'll keep checking every 5 minutes");
    const v = commitVerdict(r, w.latest);
    return v.pass ? deps.pass(r, v) : deps.miss(r, v);
  }

  return { poll, pollDue, verify };
}

export function commitReadout(r: QuestRecord): CommitReadout | null {
  return r.github ? { ...r.github, baseline: r.quest.baseline.commits ?? null } : null;
}
