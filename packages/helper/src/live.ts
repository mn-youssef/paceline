import { liveStateSchema, type LiveCapture, type LiveState, type RateWindow } from '@paceline/shared';
import { readJson } from './fsutil';
import type { Paths } from './paths';

export const EMPTY_LIVE: LiveState = { lastSeenAt: null, capture: null };

export function readLive(paths: Paths): LiveState {
  const parsed = liveStateSchema.safeParse(readJson(paths.live));
  return parsed.success ? parsed.data : EMPTY_LIVE;
}

/** Claude Code documents `resets_at` as epoch seconds; accept milliseconds too. */
export const toMs = (epoch: number): number => (epoch > 1e12 ? epoch : epoch * 1_000);

function toWindow(w: unknown): RateWindow | null {
  if (typeof w !== 'object' || w === null) return null;
  const { used_percentage: used, resets_at: resets } = w as { used_percentage?: unknown; resets_at?: unknown };
  if (typeof used !== 'number' || typeof resets !== 'number') return null;
  return { usedPct: used, resetsAt: toMs(resets) };
}

export function captureFromStatusInput(input: unknown, now: number): LiveCapture | null {
  if (typeof input !== 'object' || input === null) return null;
  const i = input as { rate_limits?: { five_hour?: unknown; seven_day?: unknown } | null; session_id?: unknown; model?: { id?: unknown } };
  const fiveHour = toWindow(i.rate_limits?.five_hour);
  const sevenDay = toWindow(i.rate_limits?.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return {
    capturedAt: now,
    sessionId: typeof i.session_id === 'string' ? i.session_id : null,
    model: typeof i.model?.id === 'string' ? i.model.id : null,
    fiveHour,
    sevenDay,
  };
}
