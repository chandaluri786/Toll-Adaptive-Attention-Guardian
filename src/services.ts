// OWNER: all three, written at hour 0. Do not edit after 1:30 except to add a service the contract adds.
//
// Wires the four owners' folders together. Each folder decides for itself whether it hands out
// real code or fakes (its own USE_REAL flag in its index.ts), so integration = one person flipping
// one flag. Every factory receives `get`, a late-bound accessor, so folders can call each other
// through the contract without importing each other's code.
import type { Services } from './contracts';
import { createEngine } from './engine';
import { createLedger } from './ledger';
import { createDevice } from './device';
import { createDay } from './day';

const services = {} as Services;
const get = () => services;

export const engine = createEngine(get); // C: clock, postureSource, governor
export const ledgerModule = createLedger(get); // C: ledger
export const device = createDevice(get); // A: usageFeed, deviceSignals
export const day = createDay(get); // B: planner, quests

Object.assign(services, {
  ...engine.services,
  ...ledgerModule.services,
  ...device.services,
  ...day.services,
});

/** Every folder's debug hooks, used by C's demo panel. */
export const debug = {
  engine: engine.debug,
  ledger: ledgerModule.debug,
  device: device.debug,
  day: day.debug,
};

export default services;
