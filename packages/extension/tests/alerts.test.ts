import { describe, expect, it } from 'vitest';
import { EMPTY_ALERTS, alertMessage, evaluateAlerts, type AlertState } from '../src/core/alerts';
import type { LimitSource, ResolvedLimits } from '../src/core/limits';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const HOUR = 3_600_000;
const T = [50, 80, 95];
const L = (pct: number, resetsAt = NOW + HOUR, source: LimitSource = 'claude-code'): ResolvedLimits => ({
  fiveHour: { pct, resetsAt },
  sevenDay: null,
  source,
  updatedAt: NOW,
});

describe('evaluateAlerts', () => {
  it('fires only the highest newly crossed threshold, once', () => {
    const first = evaluateAlerts(EMPTY_ALERTS, L(96), T);
    expect(first.fire).toEqual([{ window: '5h', threshold: 95, pct: 96, resetsAt: NOW + HOUR }]);
    expect(first.state['5h'].fired).toEqual([50, 80, 95]);
    expect(evaluateAlerts(first.state, L(97), T).fire).toEqual([]);
    expect(EMPTY_ALERTS['5h'].fired).toEqual([]);
  });

  it('fires each threshold as usage climbs', () => {
    let state: AlertState = EMPTY_ALERTS;
    const fired: number[] = [];
    for (const pct of [10, 55, 60, 85, 96]) {
      const r = evaluateAlerts(state, L(pct), T);
      state = r.state;
      fired.push(...r.fire.map((f) => f.threshold));
    }
    expect(fired).toEqual([50, 80, 95]);
  });

  it('starts over in a new window', () => {
    const a = evaluateAlerts(EMPTY_ALERTS, L(85), T);
    expect(evaluateAlerts(a.state, L(60, NOW + 6 * HOUR), T).fire.map((f) => f.threshold)).toEqual([50]);
  });

  it('ignores small jitter in the reset time', () => {
    const a = evaluateAlerts(EMPTY_ALERTS, L(85), T);
    expect(evaluateAlerts(a.state, L(86, NOW + HOUR + 60_000), T).fire).toEqual([]);
  });

  it('never alerts on stale data', () => {
    expect(evaluateAlerts(EMPTY_ALERTS, L(99, NOW + HOUR, 'stale'), T).fire).toEqual([]);
  });
});

describe('alertMessage', () => {
  it('names the window, the reset time and a next step', () => {
    expect(alertMessage({ window: '5h', threshold: 80, pct: 82.4, resetsAt: Date.UTC(2026, 9, 13, 15, 40) }, NOW, { locale: 'en-GB', timeZone: 'UTC' })).toEqual({
      title: '82% of your 5-hour limit used',
      message: 'Crossed 80%. Resets 15:40. Use Sonnet for routine edits to stretch it.',
    });
  });

  it('adds the forecast when the limit would run out before the reset', () => {
    const forecast = { status: 'before-reset' as const, slopePctPerHour: 30, etaAt: Date.UTC(2026, 9, 13, 13, 20), safePctPerHour: 20, paceRatio: 1.5, paceLevel: 'warn' as const };
    const msg = alertMessage({ window: '5h', threshold: 50, pct: 60, resetsAt: Date.UTC(2026, 9, 13, 14, 0) }, NOW, { locale: 'en-GB', timeZone: 'UTC' }, forecast);
    expect(msg.message).toBe('Crossed 50%. Resets 14:00. At this pace you hit 100% at 13:20, 40m before it resets.');
  });

  it('keeps the threshold advice and adds the forecast after it', () => {
    const forecast = { status: 'before-reset' as const, slopePctPerHour: 30, etaAt: Date.UTC(2026, 9, 13, 13, 20), safePctPerHour: 20, paceRatio: 1.5, paceLevel: 'warn' as const };
    const msg = alertMessage({ window: '5h', threshold: 95, pct: 96, resetsAt: Date.UTC(2026, 9, 13, 14, 0) }, NOW, { locale: 'en-GB', timeZone: 'UTC' }, forecast);
    expect(msg.message).toBe('Crossed 95%. Resets 14:00. Wrap up, or /compact before you continue. At this pace you hit 100% at 13:20, 40m before it resets.');
  });
});
