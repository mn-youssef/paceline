import { describe, expect, it } from 'vitest';
import { etaSentence, forecastWindow, paceLevel, slopePerHour } from '../src/core/forecast';
import type { Reading } from '../src/core/readings';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const R5 = NOW + 2 * HOUR;
const FMT = { locale: 'en-GB', timeZone: 'UTC' };

const five = (minsAgo: number, pct: number, resetsAt = R5): Reading => ({ t: NOW - minsAgo * MIN, fiveHour: { pct, resetsAt }, sevenDay: null });
// pct climbs `rate` % per hour and reaches `end` now.
const climb = (mins: number[], end: number, rate: number) => mins.map((m) => five(m, end - (m / 60) * rate));

describe('slopePerHour and paceLevel', () => {
  it('fits a straight line in % per hour', () => {
    expect(slopePerHour([{ t: 0, pct: 10 }, { t: HOUR, pct: 40 }, { t: 2 * HOUR, pct: 70 }])).toBeCloseTo(30, 9);
  });

  it('grades the pace against the safe pace', () => {
    expect([paceLevel(1), paceLevel(1.01), paceLevel(1.5), paceLevel(1.51)]).toEqual(['ok', 'warn', 'warn', 'high']);
  });
});

describe('forecastWindow', () => {
  it('projects when a climbing window runs out before its reset', () => {
    const f = forecastWindow(climb([40, 35, 30, 25, 20, 15, 10, 5, 0], 60, 30), '5h', { pct: 60, resetsAt: R5 }, NOW);
    expect(f).toMatchObject({ status: 'before-reset', slopePctPerHour: expect.closeTo(30, 6), safePctPerHour: expect.closeTo(20, 9), paceRatio: expect.closeTo(1.5, 6) });
    expect(f!.etaAt).toBeCloseTo(NOW + 80 * MIN, -3);
  });

  it('reports on pace when the limit lasts past the reset', () => {
    const f = forecastWindow(climb([40, 30, 20, 10, 0], 60, 10), '5h', { pct: 60, resetsAt: R5 }, NOW);
    expect(f).toMatchObject({ status: 'after-reset', paceLevel: 'ok' });
  });

  it('ignores readings from the previous window cycle', () => {
    const previous = [40, 35, 30, 25].map((m) => five(m, 95, NOW - 3 * HOUR));
    const f = forecastWindow([...previous, ...climb([20, 15, 10, 5, 0], 60, 30)], '5h', { pct: 60, resetsAt: R5 }, NOW);
    expect(f).toMatchObject({ status: 'before-reset', slopePctPerHour: expect.closeTo(30, 6) });
  });

  it('needs enough readings over enough time', () => {
    expect(forecastWindow(climb([15, 10, 5, 0], 60, 30), '5h', { pct: 60, resetsAt: R5 }, NOW)?.status).toBe('learning');
    expect(forecastWindow(climb([8, 6, 4, 2, 0], 60, 30), '5h', { pct: 60, resetsAt: R5 }, NOW)?.status).toBe('learning');
  });

  it('calls a flat trend steady and a full window limited', () => {
    expect(forecastWindow([20, 15, 10, 5, 0].map((m) => five(m, 60)), '5h', { pct: 60, resetsAt: R5 }, NOW)).toMatchObject({ status: 'steady', etaAt: null });
    expect(forecastWindow([], '5h', { pct: 100, resetsAt: R5 }, NOW)?.status).toBe('limited');
  });

  it('looks back 24 h for the weekly window', () => {
    const reset = NOW + 72 * HOUR;
    const weekly: Reading[] = [360, 300, 240, 180, 120, 60, 0].map((m) => ({ t: NOW - m * MIN, fiveHour: null, sevenDay: { pct: 52 - (m / 60) * 2, resetsAt: reset } }));
    const f = forecastWindow(weekly, '7d', { pct: 52, resetsAt: reset }, NOW);
    expect(f).toMatchObject({ status: 'before-reset', slopePctPerHour: expect.closeTo(2, 6) });
    expect(f!.etaAt).toBeCloseTo(NOW + 24 * HOUR, -3);
  });

  it('keeps the same forecast while no new readings arrive', () => {
    // Flat at 10% for 20 min, then climbing 120%/h; the newest reading is "now".
    const readings = [40, 35, 30, 25, 20, 15, 10, 5, 0].map((m, i) => five(m, i < 5 ? 10 : 10 + (i - 4) * 10));
    const atNow = forecastWindow(readings, '5h', { pct: 50, resetsAt: R5 }, NOW)!;
    const idle = forecastWindow(readings, '5h', { pct: 50, resetsAt: R5 }, NOW + 10 * MIN)!;
    expect(idle.slopePctPerHour).toBeCloseTo(atNow.slopePctPerHour, 9);
  });

  it('returns null without a reset time', () => {
    expect(forecastWindow([], '5h', { pct: 0, resetsAt: null }, NOW)).toBeNull();
    expect(forecastWindow([], '5h', null, NOW)).toBeNull();
  });
});

describe('etaSentence', () => {
  it('says when the limit runs out and how long before the reset', () => {
    const f = forecastWindow(climb([40, 35, 30, 25, 20, 15, 10, 5, 0], 60, 30), '5h', { pct: 60, resetsAt: R5 }, NOW)!;
    expect(etaSentence(f, R5, NOW, FMT)).toBe('At this pace you hit 100% at 13:20, 40m before it resets.');
    expect(etaSentence({ ...f, status: 'after-reset' }, R5, NOW, FMT)).toBeNull();
  });
});
