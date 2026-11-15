// OWNER: C (task C3). Composes clock → signals snapshot → score → transitions → PostureState,
// as a PostureSource. One reading per clock tick (60 s), thresholds read from the weather config
// on every reading so a Settings edit lands on the next one. Session 5 wires this into
// createRealEngine; nothing imports it yet.
import type { Clock, Posture, PostureSource, PostureState, Unsub } from '../contracts';
import { createEmitter } from '../shared/emitter';
import { FREE_TIME_MIN } from './freeTime';
import { reasonFor } from './reasons';
import { score } from './scoring';
import type { SignalsSnapshot } from './signals';
import { enforcedPosture, initialMachine, nextChangeOf, settle, step, targetFor, type MachineState } from './transitions';
import type { WeatherConfig, WeatherConfigStore } from './weatherConfig';

export type PostureEngineDeps = {
  clock: Clock;
  /** Usually `signalsBuilder.build`. */
  snapshot: () => SignalsSnapshot;
  config: WeatherConfigStore;
  /** For computedAt (A fails open on age); pass the real clock's monotonic(). Defaults to clock.now. */
  monotonic?: () => number;
};

export type PostureEngine = PostureSource & {
  /** Subscribe to the clock and take the first reading (idempotent). */
  start(): void;
  stop(): void;
  /** Take one reading now (the demo panel can call this instead of waiting a minute). */
  read(): PostureState;
  /** The weather actually enforced: during the 90-s advisory, still the old one. */
  enforced(): Posture;
  /** Back to Clear skies with no history (demo reset). */
  reset(): void;
};

type Last = { snap: SignalsSnapshot; score: number } | null;

/** When the current block or sleep window ends, where the weather goes once its base is gone. */
function scheduleChange(m: MachineState, last: Last, cfg: WeatherConfig): PostureState['nextChange'] {
  if (!last || m.posture === 'open') return null;
  const { source, signals } = last.snap;
  const end = source.kind === 'block' ? source.block.end : source.kind === 'sleep' ? source.until : null;
  if (end === null) return null;
  const to = targetFor(m.posture, score({ ...signals, baseScore: 0 }), false, cfg);
  return to === m.posture ? null : { at: end, to };
}

export function createPostureEngine({ clock, snapshot, config, monotonic = clock.now }: PostureEngineDeps): PostureEngine {
  const changes = createEmitter<PostureState>();
  let machine = initialMachine('open');
  let last: Last = null;
  let unsub: Unsub | null = null;

  const compose = (): PostureState => {
    const cfg = config.get();
    const nextChange = nextChangeOf(machine, cfg) ?? scheduleChange(machine, last, cfg);
    // During the 90-s advisory the published weather is the one still enforced; nextChange and the reason say what is gathering.
    const base = { posture: enforcedPosture(machine), nextChange, grace: machine.graceUntil !== null, computedAt: monotonic() };
    if (!last) {
      return { ...base, score: 0, reason: "Sky's clear. Enjoy it.", reasonCode: 'none', allowanceLeftMin: FREE_TIME_MIN };
    }
    const { signals, source, winMinutes } = last.snap;
    const { reason, reasonCode } = reasonFor({ posture: machine.posture, signals, source, winMinutes });
    return { ...base, score: last.score, reason, reasonCode, allowanceLeftMin: signals.allowanceLeftMin };
  };

  let state = compose();
  const publish = () => {
    state = compose();
    changes.emit(state);
    return state;
  };

  const read = () => {
    const snap = snapshot();
    const s = score(snap.signals);
    last = { snap, score: s };
    machine = step(machine, { at: clock.now(), score: s, declared: snap.signals.baseScore > 0 }, config.get());
    return publish();
  };

  /** End an advisory that ran out between readings, so get() never reports a stale grace. */
  const settleNow = () => {
    const settled = settle(machine, clock.now());
    if (settled === machine) return;
    machine = settled;
    publish();
  };

  return {
    get() {
      settleNow();
      return state;
    },
    subscribe: (fn) => changes.on(fn),
    start() {
      if (unsub) return;
      unsub = clock.onTick(() => read());
      read();
    },
    stop() {
      unsub?.();
      unsub = null;
    },
    read,
    enforced() {
      settleNow();
      return enforcedPosture(machine);
    },
    reset() {
      machine = initialMachine('open');
      last = null;
      publish();
    },
  };
}
