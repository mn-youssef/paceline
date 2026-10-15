import { SAME_CYCLE_MS, type WindowName } from './alerts';
import { formatClock, formatDuration, type FmtOpts } from './format';
import type { ResolvedLimits, WindowState } from './limits';
import type { Reading } from './readings';

export type ForecastStatus = 'limited' | 'learning' | 'steady' | 'before-reset' | 'after-reset';
export type PaceLevel = 'ok' | 'warn' | 'high';

export interface Forecast {
  status: ForecastStatus;
  slopePctPerHour: number;
  etaAt: number | null;
  safePctPerHour: number;
  paceRatio: number;
  paceLevel: PaceLevel;
}

export type Forecasts = Record<WindowName, Forecast | null>;
export const NO_FORECASTS: Forecasts = { '5h': null, '7d': null };

const MIN = 60_000;
const HOUR = 60 * MIN;
const STEADY_PCT_PER_HOUR = 0.1;

export const FORECAST_RULES: Record<WindowName, { lookbackMs: number; minSpanMs: number; minReadings: number }> = {
  '5h': { lookbackMs: 45 * MIN, minSpanMs: 10 * MIN, minReadings: 5 },
  '7d': { lookbackMs: 24 * HOUR, minSpanMs: 3 * HOUR, minReadings: 5 },
};

/** Least-squares slope of pct against time, in % per hour. */
export function slopePerHour(points: { t: number; pct: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const t0 = points[0]!.t;
  const xs = points.map((p) => (p.t - t0) / HOUR);
  const ys = points.map((p) => p.pct);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function paceLevel(ratio: number): PaceLevel {
  if (ratio > 1.5) return 'high';
  if (ratio > 1) return 'warn';
  return 'ok';
}

export function forecastWindow(readings: Reading[], window: WindowName, current: WindowState | null, now: number): Forecast | null {
  if (!current || current.resetsAt === null) return null;
  const resetsAt = current.resetsAt;
  const safe = Math.max(0, 100 - current.pct) / (Math.max(MIN, resetsAt - now) / HOUR);
  const base = { slopePctPerHour: 0, etaAt: null, safePctPerHour: safe, paceRatio: 0, paceLevel: 'ok' as PaceLevel };
  if (current.pct >= 100) return { ...base, status: 'limited' };

  const rule = FORECAST_RULES[window];
  const field = window === '5h' ? 'fiveHour' : 'sevenDay';
  // Anchor the lookback at the newest reading, not the clock: while nothing new arrives the
  // trend must stay put instead of steepening as older, flatter readings slide out.
  const newest = readings.reduce((m, r) => Math.max(m, r.t), Number.NEGATIVE_INFINITY);
  const points: { t: number; pct: number }[] = [];
  for (const r of readings) {
    const w = r[field];
    // Readings from an earlier cycle would bend the trend across a reset.
    if (newest - r.t > rule.lookbackMs || !w || w.resetsAt === null || Math.abs(w.resetsAt - resetsAt) > SAME_CYCLE_MS) continue;
    points.push({ t: r.t, pct: w.pct });
  }
  const span = points.length > 0 ? points[points.length - 1]!.t - points[0]!.t : 0;
  if (points.length < rule.minReadings || span < rule.minSpanMs) return { ...base, status: 'learning' };

  const slope = slopePerHour(points);
  if (slope <= STEADY_PCT_PER_HOUR) return { ...base, slopePctPerHour: slope, status: 'steady' };
  const etaAt = now + ((100 - current.pct) / slope) * HOUR;
  const paceRatio = safe > 0 ? slope / safe : Number.POSITIVE_INFINITY;
  return {
    status: etaAt < resetsAt ? 'before-reset' : 'after-reset',
    slopePctPerHour: slope,
    etaAt,
    safePctPerHour: safe,
    paceRatio,
    paceLevel: paceLevel(paceRatio),
  };
}

/** Forecasts only from fresh data: a stale reading says nothing about the current pace. */
export function forecastAll(readings: Reading[], limits: ResolvedLimits, now: number): Forecasts {
  if (limits.source !== 'claude-code' && limits.source !== 'claude-ai') return NO_FORECASTS;
  return { '5h': forecastWindow(readings, '5h', limits.fiveHour, now), '7d': forecastWindow(readings, '7d', limits.sevenDay, now) };
}

export function etaSentence(f: Forecast, resetsAt: number, now: number, fmt?: FmtOpts): string | null {
  if (f.status !== 'before-reset' || f.etaAt === null) return null;
  return `At this pace you hit 100% at ${formatClock(f.etaAt, now, fmt)}, ${formatDuration(resetsAt - f.etaAt)} before it resets.`;
}
