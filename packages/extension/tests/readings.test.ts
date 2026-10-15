import { describe, expect, it } from 'vitest';
import type { LimitSource, ResolvedLimits } from '../src/core/limits';
import { READINGS_MAX, appendReading, type Reading } from '../src/core/readings';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const MIN = 60_000;
const limits = (pct: number, updatedAt: number, source: LimitSource = 'claude-code'): ResolvedLimits => ({
  fiveHour: { pct, resetsAt: NOW + 120 * MIN },
  sevenDay: { pct: 10, resetsAt: NOW + 3 * 1_440 * MIN },
  source,
  updatedAt,
});

describe('appendReading', () => {
  it('adds a fresh reading stamped with its own time', () => {
    expect(appendReading([], limits(42, NOW - MIN), NOW)).toEqual([
      { t: NOW - MIN, fiveHour: { pct: 42, resetsAt: NOW + 120 * MIN }, sevenDay: { pct: 10, resetsAt: NOW + 3 * 1_440 * MIN } },
    ]);
  });

  it('ignores stale and missing readings', () => {
    expect(appendReading([], limits(42, NOW - MIN, 'stale'), NOW)).toEqual([]);
    expect(appendReading([], { fiveHour: null, sevenDay: null, source: 'none', updatedAt: null }, NOW)).toEqual([]);
  });

  it('does not repeat a reading it already has', () => {
    const once = appendReading([], limits(42, NOW - MIN), NOW);
    expect(appendReading(once, limits(42, NOW - MIN), NOW + MIN)).toEqual(once);
    expect(appendReading(once, limits(43, NOW - 2 * MIN), NOW + MIN)).toEqual(once);
  });

  it('drops readings older than 24 h and keeps at most 2,000', () => {
    const old: Reading = { t: NOW - 25 * 60 * MIN, fiveHour: null, sevenDay: null };
    expect(appendReading([old], limits(42, NOW - MIN), NOW).map((r) => r.t)).toEqual([NOW - MIN]);
    const many: Reading[] = Array.from({ length: 2_100 }, (_, i) => ({ t: NOW - (2_100 - i) * 30_000, fiveHour: null, sevenDay: null }));
    const next = appendReading(many, limits(42, NOW), NOW);
    expect(next).toHaveLength(READINGS_MAX);
    expect(next.at(-1)!.t).toBe(NOW);
  });
});
