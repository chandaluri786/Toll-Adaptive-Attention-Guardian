import type { Services } from '../../contracts';
import { createFakeDevice } from '../../device/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import { createEmitter } from '../../shared/emitter';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { QUEST_COPY } from '../quest-copy';
import { activeView, offerView, readout } from '../quest-sheet';
import { engineSheetPort } from '../quest-sheet-port';
import { createQuestEngine, type CommitReadout } from '../quests';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const NO_LIVE = { steps: 0, awayMin: 0, distanceM: null, offMs: 0 };
const watch = (over: Partial<CommitReadout> = {}): CommitReadout => ({ target: 'octocat/toll', baseline: 40, latest: 40, checkedAt: at(14), nextPollAt: at(14, 5), issue: null, ...over });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('commit readout (sheet 3.x)', () => {
  test('watching: 0 of 1 new commit and when the next check is', () => {
    // Act
    const r = readout('coding', { ...NO_LIVE, commits: watch() });
    // Assert
    expect(r).toEqual({ big: '0', sub: 'of 1 new commit', fraction: 0, line: 'Watching octocat/toll · next check 14:05' });
  });

  test('a new commit fills the ring', () => {
    // Act
    const r = readout('coding', { ...NO_LIVE, commits: watch({ latest: 43 }) });
    // Assert
    expect(r).toMatchObject({ big: '1', fraction: 1 });
  });

  test('network trouble reads calmly, with no "failed" or "blocked"', () => {
    // Act
    const lines = [
      readout('coding', NO_LIVE).line,
      readout('coding', { ...NO_LIVE, commits: watch({ baseline: null, latest: null }) }).line,
      readout('coding', { ...NO_LIVE, commits: watch({ baseline: null, latest: null, issue: 'offline' }) }).line,
      readout('coding', { ...NO_LIVE, commits: watch({ issue: 'rate_limited', nextPollAt: at(14, 30) }) }).line,
      readout('coding', { ...NO_LIVE, commits: watch({ issue: 'not_found' }) }).line,
    ];
    // Assert
    expect(lines).toEqual([
      'Reading your commit count on GitHub…',
      'Reading your commit count on GitHub…',
      "Can't reach GitHub — trying again at 14:05",
      'GitHub needs a breather — next check 14:30',
      "GitHub can't find octocat/toll — check Settings → Planner",
    ]);
    expect(lines.join(' ')).not.toMatch(/fail|block/i);
  });

  test('the offer says what is checked and what leaves the phone', () => {
    // Assert
    expect(QUEST_COPY.coding.checks).toEqual(['New commits on your GitHub, checked every 5 minutes', 'Only your username or repo goes to GitHub — no sign-in', 'No rush — finish any time today']);
  });
});

describe('coding through the real engine', () => {
  function setup(github: string | null) {
    let now = at(14);
    const get = (() => ({ clock: { now: () => now, onTick: () => () => {} } })) as unknown as () => Services;
    const kv = createMemoryKV();
    const store = createPlannerStore({ kv, now: () => now });
    if (github) store.setGithub(github);
    const planActions = createPlanActions(store, { now: () => now });
    const engine = createQuestEngine({
      now: () => now,
      kv,
      ledger: createFakeLedger(get).services.ledger,
      deviceSignals: createFakeDevice(get).services.deviceSignals,
      planner: store,
      planActions,
      steps: { subscribe: () => () => {} },
      sheetRequests: createEmitter(),
      github: async () => ({ ok: true, count: 7 }),
    });
    engine.start();
    return { port: engineSheetPort(engine, store, () => now) };
  }

  test('the Commit chip is open once GitHub is set, and the offer pays 20', () => {
    // Arrange
    const { port } = setup('octocat');
    // Act
    const view = offerView(port, { kind: 'offer', type: 'coding', error: null });
    // Assert
    expect(view).toMatchObject({ title: 'Push a commit', pays: 'Pays 20 min of umbrella time', blocked: null });
  });

  test('without GitHub the offer points at Settings', () => {
    // Arrange
    const { port } = setup(null);
    // Act
    const view = offerView(port, { kind: 'offer', type: 'coding', error: null });
    // Assert
    expect(view.blocked).toBe('Add your GitHub username in Settings → Planner');
  });

  test('in progress shows the live commit readout', async () => {
    // Arrange
    const { port } = setup('octocat');
    const r = port.accept('coding');
    if (!r.ok) throw new Error(r.error);
    await flush();
    // Act
    const view = activeView(port, r.quest, port.progress(r.quest.id));
    // Assert
    expect(view).toMatchObject({ title: 'Commit', pays: "Pays 20 min when it's done" });
    expect(view.readout).toEqual({ big: '0', sub: 'of 1 new commit', fraction: 0, line: 'Watching octocat · next check 14:05' });
  });
});
