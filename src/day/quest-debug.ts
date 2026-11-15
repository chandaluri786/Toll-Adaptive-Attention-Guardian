// OWNER: B (Spec B — task B3). The quest engine's demo-panel hooks (contract QuestsDebug), kept
// apart from quests.ts. The engine hands in the few internals they drive.
import type { QuestsDebug, TaskType, Verdict } from '../contracts';
import { METHOD_FOR } from './quest-rules';
import type { QuestRecord } from './quest-state';
import type { AcceptResult } from './quests';

/** Debug `addSteps` stands for a real walk at this pace, so a demo walk isn't "too quick". */
const DEBUG_STEPS_PER_MIN = 100;

type DebugDeps = {
  reset: () => void;
  addStepCount: (n: number, walkMin: number) => void;
  expireDue: () => void;
  liveRecords: () => QuestRecord[];
  accept: (type: TaskType) => AcceptResult;
  find: (questId: string) => QuestRecord | null;
  /** Pass at the plan task's own rate (no flags). */
  pass: (r: QuestRecord, v: Verdict) => void;
};

export function createEngineDebug(deps: DebugDeps): QuestsDebug {
  return {
    reset: deps.reset,
    seed: deps.reset,
    addSteps(n) {
      if (!Number.isFinite(n) || n <= 0) return;
      deps.addStepCount(Math.round(n), n / DEBUG_STEPS_PER_MIN);
    },
    passActive() {
      deps.expireDue();
      let r = deps.liveRecords()[0];
      if (!r) {
        const made = deps.accept('fitness');
        const fallback = made.ok ? made : deps.accept('focus');
        if (!fallback.ok) return;
        r = deps.find(fallback.quest.id)!;
      }
      const v: Verdict = { questId: r.quest.id, pass: true, method: METHOD_FOR[r.quest.type], reason: 'Done (demo)', measured: `${r.quest.target} of ${r.quest.target}`, flags: [] };
      deps.pass(r, v);
    },
  };
}
