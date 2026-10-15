import type { WindowName } from './alerts';
import type { ResolvedLimits } from './limits';

export interface Tracked {
  pct: number;
  resetsAt: number | null;
}

export type ResetTracker = Record<WindowName, Tracked | null>;

export const EMPTY_TRACKER: ResetTracker = { '5h': null, '7d': null };
export const CELEBRATE_BADGE_MS = 30 * 60_000;

/**
 * A reset happened when the last reading we kept has a reset time in the past. Works even if the
 * browser was closed at the time: the next refresh notices, once, because the tracker moves on.
 */
export function detectResets(prev: ResetTracker, limits: ResolvedLimits, now: number, threshold: number): { next: ResetTracker; celebrate: WindowName[] } {
  const next: ResetTracker = { ...prev };
  const celebrate: WindowName[] = [];
  for (const [name, cur] of [['5h', limits.fiveHour], ['7d', limits.sevenDay]] as const) {
    const p = prev[name];
    if (p && p.resetsAt !== null && now >= p.resetsAt) {
      if (p.pct >= threshold) celebrate.push(name);
      next[name] = cur ? { pct: cur.pct, resetsAt: cur.resetsAt } : { pct: 0, resetsAt: null };
    } else if (cur) {
      next[name] = { pct: cur.pct, resetsAt: cur.resetsAt };
    }
  }
  return { next, celebrate };
}

export function resetAlarms(limits: ResolvedLimits, now: number): { name: string; when: number }[] {
  const out: { name: string; when: number }[] = [];
  for (const [name, w] of [['5h', limits.fiveHour], ['7d', limits.sevenDay]] as const) {
    if (w?.resetsAt != null && w.resetsAt > now) out.push({ name: `reset:${name}`, when: w.resetsAt });
  }
  return out;
}

export function celebrationText(windows: WindowName[]): { title: string; message: string } {
  return {
    title: 'Fresh limit! 🎉',
    message: windows.includes('7d') ? 'Your weekly limit just reset. Go build something great.' : "Your 5-hour limit just reset. You're back to 0%.",
  };
}
