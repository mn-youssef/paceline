import { SAME_CYCLE_MS, type WindowName } from './alerts';
import type { Forecasts } from './forecast';
import { formatClock, formatDuration, type FmtOpts } from './format';
import type { ResolvedLimits } from './limits';

/** The reset time of the cycle already warned about, per window. */
export type PaceAlertState = Record<WindowName, number | null>;
export const EMPTY_PACE_ALERTS: PaceAlertState = { '5h': null, '7d': null };

const MIN = 60_000;
export const PACE_ALERT_HORIZON_MS: Record<WindowName, number> = { '5h': 90 * MIN, '7d': 24 * 60 * MIN };
export const PACE_ALERT_MARGIN_MS = 10 * MIN;

export interface PaceAlert {
  window: WindowName;
  etaAt: number;
  resetsAt: number;
}

export function evaluatePaceAlerts(prev: PaceAlertState, forecasts: Forecasts, limits: ResolvedLimits, now: number): { state: PaceAlertState; fire: PaceAlert[] } {
  const state: PaceAlertState = { ...prev };
  const fire: PaceAlert[] = [];
  for (const [name, cur] of [['5h', limits.fiveHour], ['7d', limits.sevenDay]] as const) {
    const f = forecasts[name];
    if (!f || f.status !== 'before-reset' || f.etaAt === null || !cur || cur.resetsAt === null) continue;
    const warned = prev[name];
    if (warned !== null && Math.abs(warned - cur.resetsAt) <= SAME_CYCLE_MS) continue;
    if (f.etaAt - now > PACE_ALERT_HORIZON_MS[name] || cur.resetsAt - f.etaAt < PACE_ALERT_MARGIN_MS) continue;
    state[name] = cur.resetsAt;
    fire.push({ window: name, etaAt: f.etaAt, resetsAt: cur.resetsAt });
  }
  return { state, fire };
}

export function paceAlertMessage(a: PaceAlert, now: number, fmt?: FmtOpts): { title: string; message: string } {
  const label = a.window === '5h' ? '5-hour' : 'weekly';
  return {
    title: `On pace to hit your ${label} limit`,
    message: `At this pace you hit 100% at ${formatClock(a.etaAt, now, fmt)}, ${formatDuration(a.resetsAt - a.etaAt)} before it resets. Use Sonnet for routine edits or /compact long sessions.`,
  };
}
