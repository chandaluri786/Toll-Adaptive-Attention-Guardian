// OWNER: B. Small pure formatters shared by the quest sheet (B8) and Today (B9).
import { MIN } from '../shared/emitter';
import { formatHHMM, minutesOfDay } from './time';

/** 1395 → "1,395". */
export const formatCount = (n: number): string => Math.floor(Math.max(0, n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 291_000 ms → "4:51"; negative → "0:00". */
export function formatMinSec(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 72 → "1 h 12 m", 120 → "2 h", 40 → "40 m". */
export function formatHoursMin(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  if (h === 0) return `${m} m`;
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} m`;
}

/** A timestamp as local "HH:MM". */
export const clockTime = (at: number): string => formatHHMM(minutesOfDay(at));

/** Whole minutes, rounded up, from now until `at` (never below 0). */
export const minutesUntil = (at: number, now: number): number => Math.max(0, Math.ceil((at - now) / MIN));

/** "You're 200 m from home — need 500 m" → "…500 m." (reasons read as sentences on the sheet). */
export const asSentence = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
