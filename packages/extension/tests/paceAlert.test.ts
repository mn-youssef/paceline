import { describe, expect, it } from 'vitest';
import type { Forecast, Forecasts } from '../src/core/forecast';
import type { ResolvedLimits } from '../src/core/limits';
import { EMPTY_PACE_ALERTS, evaluatePaceAlerts, paceAlertMessage } from '../src/core/paceAlert';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const MIN = 60_000;
const R5 = NOW + 120 * MIN;
const FMT = { locale: 'en-GB', timeZone: 'UTC' };
const limits = (resetsAt = R5): ResolvedLimits => ({ fiveHour: { pct: 60, resetsAt }, sevenDay: null, source: 'claude-code', updatedAt: NOW });
const before = (etaAt: number): Forecast => ({ status: 'before-reset', slopePctPerHour: 30, etaAt, safePctPerHour: 20, paceRatio: 1.5, paceLevel: 'warn' });
const only5h = (f: Forecast | null): Forecasts => ({ '5h': f, '7d': null });

describe('evaluatePaceAlerts', () => {
  it('fires once per window cycle', () => {
    const first = evaluatePaceAlerts(EMPTY_PACE_ALERTS, only5h(before(NOW + 80 * MIN)), limits(), NOW);
    expect(first.fire).toEqual([{ window: '5h', etaAt: NOW + 80 * MIN, resetsAt: R5 }]);
    const flicker = evaluatePaceAlerts(first.state, only5h({ ...before(NOW + 70 * MIN) }), limits(R5 + MIN), NOW + 5 * MIN);
    expect(flicker.fire).toEqual([]);
    const nextCycle = evaluatePaceAlerts(first.state, only5h(before(NOW + 6 * 60 * MIN)), limits(NOW + 7 * 60 * MIN), NOW + 5 * 60 * MIN);
    expect(nextCycle.fire).toHaveLength(1);
  });

  it('waits until the run-out is near and clearly before the reset', () => {
    expect(evaluatePaceAlerts(EMPTY_PACE_ALERTS, only5h(before(NOW + 100 * MIN)), limits(NOW + 200 * MIN), NOW).fire).toEqual([]);
    expect(evaluatePaceAlerts(EMPTY_PACE_ALERTS, only5h(before(R5 - 5 * MIN)), limits(), NOW).fire).toEqual([]);
    expect(evaluatePaceAlerts(EMPTY_PACE_ALERTS, only5h({ ...before(NOW + 80 * MIN), status: 'after-reset' }), limits(), NOW).fire).toEqual([]);
  });
});

describe('paceAlertMessage', () => {
  it('names the window, the run-out time and a next step', () => {
    expect(paceAlertMessage({ window: '5h', etaAt: NOW + 80 * MIN, resetsAt: R5 }, NOW, FMT)).toEqual({
      title: 'On pace to hit your 5-hour limit',
      message: 'At this pace you hit 100% at 13:20, 40m before it resets. Use Sonnet for routine edits or /compact long sessions.',
    });
  });
});
