import type { LiveCapture, RateWindow } from '@paceline/shared';

export interface WindowState {
  pct: number;
  resetsAt: number | null;
}

export type LimitSource = 'claude-code' | 'claude-ai' | 'stale' | 'none';

export interface ResolvedLimits {
  fiveHour: WindowState | null;
  sevenDay: WindowState | null;
  source: LimitSource;
  updatedAt: number | null;
}

export interface FallbackReading {
  fetchedAt: number;
  fiveHour: RateWindow | null;
  sevenDay: RateWindow | null;
}

export const STALE_MS = 15 * 60_000;
export const NO_LIMITS: ResolvedLimits = { fiveHour: null, sevenDay: null, source: 'none', updatedAt: null };

/** A window whose reset time has passed is known to be empty, even if the reading is old. */
function toWindow(w: RateWindow | null, now: number): WindowState | null {
  if (!w) return null;
  return now >= w.resetsAt ? { pct: 0, resetsAt: null } : { pct: w.usedPct, resetsAt: w.resetsAt };
}

export function resolveLimits(i: { capture: LiveCapture | null; fallback: FallbackReading | null; now: number }): ResolvedLimits {
  const readings = [
    i.capture && { at: i.capture.capturedAt, fiveHour: i.capture.fiveHour, sevenDay: i.capture.sevenDay, source: 'claude-code' as const },
    i.fallback && { at: i.fallback.fetchedAt, fiveHour: i.fallback.fiveHour, sevenDay: i.fallback.sevenDay, source: 'claude-ai' as const },
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  if (readings.length === 0) return NO_LIMITS;
  // Claude Code is listed first, so it wins whenever both are fresh.
  const fresh = readings.find((r) => i.now - r.at < STALE_MS);
  const pick = fresh ?? readings.reduce((a, b) => (b.at > a.at ? b : a));
  return {
    fiveHour: toWindow(pick.fiveHour, i.now),
    sevenDay: toWindow(pick.sevenDay, i.now),
    source: fresh ? pick.source : 'stale',
    updatedAt: pick.at,
  };
}
