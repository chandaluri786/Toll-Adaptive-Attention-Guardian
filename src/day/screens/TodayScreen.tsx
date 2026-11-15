// OWNER: B (Spec B — task B9). Today (docs/design 2.1–2.5): sky with weather, reason and next
// change; umbrella time as the hero (umbrella-up countdown, 2.4); the free-time meter; today's
// tasks with live progress or Verify, or "No plan today — that's fine"; one suggested quest.
// The view model is ../today.ts (pure, tested); this file gathers inputs and lays out cards.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import services, { day } from '../../services';
import { useBalance, usePosture } from '../../shared/hooks';
import { useTheme } from '../../ui/components';
import { radius, space } from '../../ui/theme';
import { SkyHeader } from '../components/today/SkyHeader';
import { FreeTimeCard, SuggestedQuest, TaskList, UmbrellaCard } from '../components/today/TodayCards';
import { sheetRequests } from '../fakes';
import { useNow } from '../hooks';
import { todaysPlan, type PlannerState } from '../planner';
import { QUEST_TARGETS } from '../quest-rules';
import type { Offer } from '../quests';
import { todaysTotals, todayView, type TodayInput } from '../today';

const SLOW_TICK_MS = 30_000;
const FAKE_SUGGESTION: Offer = { type: 'fitness', title: 'Walk 2,000 steps', target: QUEST_TARGETS.fitness, estMin: 20 };
const noop = () => () => {};

function useProgressKey(): string {
  return useSyncExternalStore(
    (cb) => services.planner.onChange(cb),
    () => {
      const p = services.planner.progress();
      return `${p.done}/${p.total}`;
    },
  );
}

/** The real planner state when the day module exposes its store (USE_REAL), else null (fakes). */
function usePlannerStoreState(): PlannerState | null {
  const store = day.plannerStore?.();
  return useSyncExternalStore(store ? store.subscribe : noop, () => (store ? store.getState() : null));
}

/** Re-render on quest engine changes (steps, location, screen) for live progress. */
function useEngineChanges(): void {
  const [, setRev] = useState(0);
  useEffect(() => day.engine?.().subscribe(() => setRev((x) => x + 1)), []);
}

function liveByTask(): TodayInput['liveByTask'] {
  const engine = day.engine?.();
  if (!engine) return {};
  const out: TodayInput['liveByTask'] = {};
  for (const q of engine.active()) {
    const p = q.taskId ? engine.progress(q.id) : null;
    if (q.taskId && p) out[q.taskId] = { type: q.type, live: p.live, target: q.target };
  }
  return out;
}

export default function TodayScreen() {
  const t = useTheme();
  const state = usePosture();
  const balance = useBalance();
  const progressKey = useProgressKey();
  const plannerState = usePlannerStoreState();
  useEngineChanges();
  const windowsNow = services.ledger.activeWindows();
  const now = useNow(windowsNow.length > 0 ? 1000 : SLOW_TICK_MS);
  const [done, total] = progressKey.split('/').map(Number);
  const engine = day.engine?.();

  const view = todayView({
    state,
    balance,
    now,
    earnedSpent: todaysTotals(services.ledger.history(1), now),
    windows: windowsNow,
    blockAt: (at) => services.planner.nextBlock(at - 1),
    progress: { done, total },
    tasks: plannerState ? (todaysPlan(plannerState, now)?.tasks ?? []) : null,
    liveByTask: liveByTask(),
    suggestion: engine ? engine.suggest(now) : FAKE_SUGGESTION,
    ...(engine ? { quizReady: engine.quizReady } : {}),
  });

  const openSheet = (offer?: { type: Offer['type']; taskId?: string }) => sheetRequests.emit({ from: 'today', posture: state.posture, ...(offer ? { offer } : {}) });

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: space.xl }}>
      <SkyHeader posture={state.posture} name={view.weatherName} reason={view.reason} nextLine={view.nextLine} />
      <View style={{ marginTop: -space.l, borderTopLeftRadius: radius.l + 8, borderTopRightRadius: radius.l + 8, backgroundColor: t.bg, padding: space.m, gap: space.m - 2 }}>
        <UmbrellaCard u={view.umbrella} />
        <FreeTimeCard f={view.free} />
        <TaskList
          tasks={view.tasks}
          onVerify={(row) => row.status.kind === 'verify' && openSheet({ type: row.status.questType, taskId: row.id })}
          onPlan={() => services.planner.openPlanSheet()}
        />
        {view.suggested && <SuggestedQuest s={view.suggested} onOpen={() => openSheet({ type: view.suggested!.type, ...(view.suggested!.taskId ? { taskId: view.suggested!.taskId } : {}) })} />}
      </View>
    </ScrollView>
  );
}
