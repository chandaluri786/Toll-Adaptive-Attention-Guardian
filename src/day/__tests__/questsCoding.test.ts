import type { Quest, Services, Verdict } from '../../contracts';
import { createFakeDevice, HOME } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter, MIN } from '../../shared/emitter';
import type { CommitCount } from '../github-client';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { createQuestEngine } from '../quests';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

/** GitHub stand-in: every call is recorded and answered from `next` (a count or a failure). */
function fakeGithub() {
  const calls: string[] = [];
  let next: CommitCount = { ok: true, count: 40 };
  return {
    calls,
    answer(r: CommitCount | number) {
      next = typeof r === 'number' ? { ok: true, count: r } : r;
    },
    count: async (target: string) => {
      calls.push(target);
      return next;
    },
  };
}

function setup(opts: { github?: string | null; plan?: boolean; count?: (target: string) => Promise<CommitCount> } = {}) {
  let now = at(10);
  const get = (() => ({ clock: { now: () => now, onTick: () => () => {} }, postureSource: { get: () => ({ posture: 'open' }) } })) as unknown as () => Services;
  const kv = createMemoryKV();
  const store = createPlannerStore({ kv, now: () => now });
  store.setHome(HOME);
  if (opts.github !== null) store.setGithub(opts.github ?? 'octocat/toll');
  const planActions = createPlanActions(store, { now: () => now });
  if (opts.plan !== false) planActions.startPlan([{ type: 'coding', title: 'Ship the parser fix' }]);
  const github = fakeGithub();
  const ledger = createFakeLedger(get);
  const engine = createQuestEngine({
    now: () => now,
    kv,
    ledger: ledger.services.ledger,
    deviceSignals: createFakeDevice(get).services.deviceSignals,
    planner: store,
    planActions,
    steps: { subscribe: () => () => {} },
    sheetRequests: createEmitter(),
    github: opts.count ?? github.count,
  });
  engine.start();
  const verified: { q: Quest; v: Verdict; minted: number }[] = [];
  engine.onVerified((q, v, minted) => verified.push({ q, v, minted }));
  const task = store.getState().plan?.tasks[0];
  const advance = async (ms: number) => {
    now += ms;
    engine.tick();
    await flush();
  };
  return { engine, store, github, ledger, verified, task, kv, advance, now: () => now };
}

async function acceptCoding(s: ReturnType<typeof setup>) {
  const r = s.engine.accept('coding', s.task?.id);
  if (!r.ok) throw new Error(r.error);
  await flush();
  return r.quest;
}

describe('coding quests: setup', () => {
  test('without a GitHub name the quest waits for Settings, and is never suggested', () => {
    // Arrange
    const s = setup({ github: null });
    // Act
    const r = s.engine.accept('coding', s.task!.id);
    // Assert
    expect(r).toEqual({ ok: false, error: 'Add your GitHub username in Settings → Planner' });
    expect(s.engine.blocked('coding')).toBe('Add your GitHub username in Settings → Planner');
    expect(s.engine.suggest()?.type).not.toBe('coding');
  });

  test('with a GitHub name a coding plan task is offered as a commit quest', () => {
    // Act
    const s = setup();
    // Assert
    expect(s.engine.blocked('coding')).toBeNull();
    expect(s.engine.suggest()).toMatchObject({ type: 'coding', taskId: s.task!.id, target: 1 });
  });
});

describe('coding quests: baseline and polling', () => {
  test('accept records the baseline commit count from GitHub', async () => {
    // Arrange
    const s = setup();
    // Act
    const quest = await acceptCoding(s);
    // Assert
    expect(s.github.calls).toEqual(['octocat/toll']);
    expect(s.engine.active()[0].baseline).toEqual({ commits: 40 });
    expect(s.engine.progress(quest.id)!.live.commits).toEqual({ target: 'octocat/toll', baseline: 40, latest: 40, checkedAt: at(10), nextPollAt: at(10, 5), issue: null });
  });

  test('polls every 5 minutes, not more often, and passes on any increase', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    // Act
    await s.advance(4 * MIN);
    const afterFour = s.github.calls.length;
    await s.advance(1 * MIN);
    const afterFive = s.github.calls.length;
    s.github.answer(41);
    await s.advance(5 * MIN);
    // Assert
    expect(afterFour).toBe(1);
    expect(afterFive).toBe(2);
    expect(s.verified).toHaveLength(1);
    expect(s.verified[0].q).toMatchObject({ id: quest.id, status: 'passed' });
    expect(s.verified[0].v).toMatchObject({ pass: true, method: 'commit_delta', measured: '1 of 1 new commit' });
    expect(s.verified[0].minted).toBeGreaterThan(0);
    expect(s.store.getState().plan!.tasks[0].done).toBe(1);
    expect(s.engine.active()).toEqual([]);
  });

  test('stops polling once the quest has passed, ended or expired', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    s.engine.abandon(quest.id);
    // Act
    await s.advance(30 * MIN);
    // Assert
    expect(s.github.calls).toHaveLength(1);
  });

  test('a slow answer is never doubled up by the next tick', async () => {
    // Arrange
    let release: (r: CommitCount) => void = () => {};
    const pending = new Promise<CommitCount>((r) => (release = r));
    let calls = 0;
    const s = setup({
      count: () => {
        calls++;
        return pending;
      },
    });
    // Act
    s.engine.accept('coding', s.task!.id);
    await s.advance(6 * MIN);
    await s.advance(6 * MIN);
    release({ ok: true, count: 3 });
    await flush();
    // Assert
    expect(calls).toBe(1);
    expect(s.engine.active()[0].baseline).toEqual({ commits: 3 });
  });

  test('the GitHub name is fixed per quest: changing Settings mid-quest keeps the old target', async () => {
    // Arrange
    const s = setup();
    await acceptCoding(s);
    s.store.setGithub('someone-else');
    // Act
    await s.advance(5 * MIN);
    // Assert
    expect(s.github.calls).toEqual(['octocat/toll', 'octocat/toll']);
  });

  test('time comes from the injected clock, never Date.now', async () => {
    // Arrange
    const spy = jest.spyOn(Date, 'now');
    const s = setup();
    // Act
    await acceptCoding(s);
    s.github.answer(41);
    await s.advance(5 * MIN);
    // Assert
    expect(s.verified).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('coding quests: network trouble is calm', () => {
  test('offline at accept: no miss, the baseline comes from the first good read', async () => {
    // Arrange
    const s = setup();
    s.github.answer({ ok: false, reason: 'offline' });
    const quest = await acceptCoding(s);
    // Act
    const p1 = s.engine.progress(quest.id)!;
    s.github.answer(40);
    await s.advance(5 * MIN);
    s.github.answer(41);
    await s.advance(5 * MIN);
    // Assert
    expect(p1.live.commits).toMatchObject({ baseline: null, latest: null, issue: 'offline' });
    expect(p1.canClaimHalf).toBe(false);
    expect(s.verified).toHaveLength(1);
  });

  test('verify before GitHub has answered says so and never fails the quest', async () => {
    // Arrange
    const s = setup();
    s.github.answer({ ok: false, reason: 'error' });
    const quest = await acceptCoding(s);
    // Act
    const r = s.engine.verify(quest.id);
    // Assert
    expect(r).toEqual({ kind: 'unavailable', error: "Can't reach GitHub right now — we'll keep checking every 5 minutes" });
    expect(s.engine.progress(quest.id)!.canClaimHalf).toBe(false);
    expect(s.engine.active()).toHaveLength(1);
  });

  test('rate limited: waits until GitHub resets (at least 5 min, at most 30), no miss', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    s.github.answer({ ok: false, reason: 'rate_limited', resetAt: s.now() + 5 * MIN + 12 * MIN });
    await s.advance(5 * MIN);
    // Act
    const p = s.engine.progress(quest.id)!;
    await s.advance(11 * MIN);
    const beforeReset = s.github.calls.length;
    s.github.answer(42);
    await s.advance(1 * MIN);
    // Assert
    expect(p.live.commits).toMatchObject({ issue: 'rate_limited', nextPollAt: at(10, 17) });
    expect(beforeReset).toBe(2);
    expect(s.verified).toHaveLength(1);
  });

  test('retry-after is honoured, but never waits past 30 minutes', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    s.github.answer({ ok: false, reason: 'rate_limited', retryAfterMs: 3 * 60 * MIN });
    // Act
    await s.advance(5 * MIN);
    // Assert
    expect(s.engine.progress(quest.id)!.live.commits!.nextPollAt).toBe(at(10, 35));
  });

  test('an unknown name says where to fix it', async () => {
    // Arrange
    const s = setup();
    s.github.answer({ ok: false, reason: 'not_found' });
    const quest = await acceptCoding(s);
    // Act
    const r = s.engine.verify(quest.id);
    // Assert
    expect(r).toEqual({ kind: 'unavailable', error: "GitHub can't find octocat/toll — check the name in Settings → Planner" });
  });
});

describe('coding quests: Verify now', () => {
  test('a fresh read with no new commit is a plain miss: retry in 5 min, claim half on offer', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    // Act
    const r = s.engine.verify(quest.id);
    // Assert
    expect(r).toMatchObject({ kind: 'missed', retryAt: at(10, 5), verdict: { method: 'commit_delta', reason: 'No new commits on octocat/toll yet — push one and it shows up here', measured: '0 of 1 new commit' } });
    expect(s.engine.progress(quest.id)!.canClaimHalf).toBe(true);
  });

  test('a stale read checks GitHub again instead of missing, and passes from that check', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    await s.advance(3 * MIN);
    s.github.answer(41);
    // Act
    const r = s.engine.verify(quest.id);
    await flush();
    // Assert
    expect(r).toEqual({ kind: 'unavailable', error: 'Checking GitHub now — give it a moment' });
    expect(s.github.calls).toHaveLength(2);
    expect(s.verified).toHaveLength(1);
  });

  test('the poll state survives a restart', async () => {
    // Arrange
    const s = setup();
    const quest = await acceptCoding(s);
    // Act
    const raw = JSON.parse(s.kv.getString('quests')!);
    // Assert
    expect(raw.records[0].github).toMatchObject({ target: 'octocat/toll', latest: 40, nextPollAt: at(10, 5) });
    expect(raw.records[0].quest.id).toBe(quest.id);
  });
});
