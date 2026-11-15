import type { Services } from '../../contracts';
import { createFakeDevice } from '../../device/fakes';
import { createFakeEngine } from '../../engine/fakes';
import { createFakeLedger } from '../../ledger/fakes';
import type { GithubFetch } from '../github-client';
import { createMemoryKV } from '../kv';
import { createPlanActions } from '../plan';
import { createPlannerStore } from '../planner';
import { createRealDay } from '../real';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(fetch?: GithubFetch) {
  const services = {} as Services;
  const get = () => services;
  const engine = createFakeEngine();
  engine.debug.clock.setNow(at(9));
  const kv = createMemoryKV();
  const day = createRealDay(get, {
    store: () => createPlannerStore({ kv, now: () => get().clock.now() }),
    kv: () => kv,
    steps: () => ({ subscribe: () => () => {} }),
    ...(fetch ? { github: { fetch } } : {}),
  });
  Object.assign(services, engine.services, createFakeLedger(get).services, createFakeDevice(get).services, day.services);
  return { day, clock: engine.debug.clock, now: () => get().clock.now() };
}

describe('real day + GitHub', () => {
  test('a coding plan task passes once the repo gains a commit on a 5-minute poll', async () => {
    // Arrange
    let count = 12;
    const urls: string[] = [];
    const fetch: GithubFetch = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ total_count: count }) };
    };
    const { day, clock, now } = setup(fetch);
    const store = day.plannerStore();
    store.setGithub('octocat');
    createPlanActions(store, { now }).startPlan([{ type: 'coding', title: 'Ship it' }]);
    const engine = day.engine();
    const task = store.getState().plan!.tasks[0];
    // Act
    const r = engine.accept('coding', task.id);
    await flush();
    count = 13;
    clock.setNow(at(9, 6)); // the fake clock runs on real time too, so step past 09:05 with room
    engine.tick();
    await flush();
    // Assert
    expect(r.ok).toBe(true);
    expect(urls).toEqual(['https://api.github.com/search/commits?q=author%3Aoctocat&per_page=1', 'https://api.github.com/search/commits?q=author%3Aoctocat&per_page=1']);
    expect(store.getState().plan!.tasks[0].done).toBe(1);
  });

  test('no GitHub client wired → coding stays unavailable instead of failing', () => {
    // Arrange
    const { day } = setup();
    day.plannerStore().setGithub('octocat');
    // Act
    const r = day.engine().accept('coding');
    // Assert
    expect(r).toEqual({ ok: false, error: "Coding quests aren't ready yet" });
  });
});
