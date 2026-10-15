import type { ResolvedLimits, WindowState } from './limits';

export interface Reading {
  t: number;
  fiveHour: WindowState | null;
  sevenDay: WindowState | null;
}

export const READINGS_MAX_AGE_MS = 24 * 3_600_000;
export const READINGS_MAX = 2_000;

/**
 * Adds the current reading when it is fresh and newer than the last one. A stale value repeated
 * on every tick would fake a flat trend. Keeps 24 hours, at most 2,000 entries.
 */
export function appendReading(readings: Reading[], limits: ResolvedLimits, now: number): Reading[] {
  const fresh = limits.source === 'claude-code' || limits.source === 'claude-ai';
  const last = readings.at(-1);
  const isNew = fresh && limits.updatedAt !== null && (!last || limits.updatedAt > last.t);
  const next = isNew ? [...readings, { t: limits.updatedAt!, fiveHour: limits.fiveHour, sevenDay: limits.sevenDay }] : readings;
  return next.filter((r) => now - r.t <= READINGS_MAX_AGE_MS).slice(-READINGS_MAX);
}
