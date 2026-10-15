import { etaSentence, type Forecast } from './forecast';
import { formatClock, type FmtOpts } from './format';
import type { ResolvedLimits } from './limits';

export type WindowName = '5h' | '7d';

export interface WindowAlertState {
  resetsAt: number | null;
  fired: number[];
}

export type AlertState = Record<WindowName, WindowAlertState>;

export const EMPTY_ALERTS: AlertState = { '5h': { resetsAt: null, fired: [] }, '7d': { resetsAt: null, fired: [] } };

export interface Alert {
  window: WindowName;
  threshold: number;
  pct: number;
  resetsAt: number | null;
}

// Successive readings of one window can report reset times a few seconds apart.
export const SAME_CYCLE_MS = 10 * 60_000;

export function evaluateAlerts(prev: AlertState, limits: ResolvedLimits, thresholds: number[]): { state: AlertState; fire: Alert[] } {
  const state: AlertState = {
    '5h': { resetsAt: prev['5h'].resetsAt, fired: [...prev['5h'].fired] },
    '7d': { resetsAt: prev['7d'].resetsAt, fired: [...prev['7d'].fired] },
  };
  const fire: Alert[] = [];
  if (limits.source !== 'claude-code' && limits.source !== 'claude-ai') return { state, fire };
  const sorted = [...thresholds].sort((a, b) => a - b);
  for (const [name, w] of [['5h', limits.fiveHour], ['7d', limits.sevenDay]] as const) {
    if (!w) continue;
    const s = state[name];
    const newCycle = w.resetsAt !== null && (s.resetsAt === null || Math.abs(w.resetsAt - s.resetsAt) > SAME_CYCLE_MS);
    if (newCycle) {
      s.resetsAt = w.resetsAt;
      s.fired = [];
    }
    const crossed = sorted.filter((t) => w.pct >= t && !s.fired.includes(t));
    if (crossed.length === 0) continue;
    s.fired.push(...crossed);
    fire.push({ window: name, threshold: crossed[crossed.length - 1]!, pct: w.pct, resetsAt: w.resetsAt });
  }
  return { state, fire };
}

export function alertMessage(a: Alert, now: number, fmt?: FmtOpts, forecast?: Forecast | null): { title: string; message: string } {
  const label = a.window === '5h' ? '5-hour' : 'weekly';
  const reset = a.resetsAt !== null ? ` Resets ${formatClock(a.resetsAt, now, fmt)}.` : '';
  const advice = a.threshold >= 95 ? ' Wrap up, or /compact before you continue.' : a.threshold >= 80 ? ' Use Sonnet for routine edits to stretch it.' : '';
  const eta = forecast && a.resetsAt !== null ? etaSentence(forecast, a.resetsAt, now, fmt) : null;
  return { title: `${Math.round(a.pct)}% of your ${label} limit used`, message: `Crossed ${a.threshold}%.${reset}${advice}${eta ? ` ${eta}` : ''}` };
}
