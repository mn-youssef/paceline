import { describe, expect, it } from 'vitest';
import { addDailyUsage, cycleHigh, habitSummary, pruneDaily, streakDays } from '../src/core/habits';
import type { Reading } from '../src/core/readings';

// Local times, so the test passes in any time zone.
const at = (day: number, hour = 15, month = 9) => new Date(2026, month, day, hour, 0).getTime();
const reading = (t: number, pct: number, resetsAt = at(17, 21)): Reading => ({ t, fiveHour: null, sevenDay: { pct, resetsAt } });

describe('daily usage', () => {
  it("adds the weekly rise to the newer reading's local day", () => {
    expect(addDailyUsage({}, reading(at(13, 9), 10), reading(at(13, 10), 12.5))).toEqual({ '2026-10-13': 2.5 });
    expect(addDailyUsage({ '2026-10-13': 2.5 }, reading(at(13, 10), 12.5), reading(at(13, 11), 13))).toEqual({ '2026-10-13': 3 });
  });

  it('ignores drops, a missing previous reading and rises across a weekly reset', () => {
    expect(addDailyUsage({}, reading(at(13, 9), 12), reading(at(13, 10), 11))).toEqual({});
    expect(addDailyUsage({}, undefined, reading(at(13, 10), 11))).toEqual({});
    expect(addDailyUsage({}, reading(at(10, 20), 90, at(10, 21)), reading(at(11, 9), 4))).toEqual({});
  });

  it('measures rises from the highest reading of the cycle, so sources that disagree slightly count nothing twice', () => {
    const seen = [reading(at(13, 9), 41.6), reading(at(13, 10), 41)];
    const next = reading(at(13, 11), 41.8);
    expect(cycleHigh(seen, next)?.sevenDay?.pct).toBe(41.6);
    expect(addDailyUsage({}, cycleHigh(seen, next), next)['2026-10-13']).toBeCloseTo(0.2);
    expect(cycleHigh([reading(at(10, 20), 90, at(10, 21))], next)).toBeUndefined();
  });

  it('keeps 120 days', () => {
    expect(Object.keys(pruneDaily({ '2026-06-01': 5, '2026-06-20': 4, '2026-10-13': 3 }, at(13)))).toEqual(['2026-06-20', '2026-10-13']);
  });
});

describe('streaks', () => {
  const daily = { '2026-10-08': 20, '2026-10-09': 10, '2026-10-11': 12, '2026-10-12': 14, '2026-10-13': 3 };

  it('counts days at or under budget, skipping days without use, until a day over it', () => {
    expect(streakDays(daily, 14, at(13))).toBe(4);
  });

  it('is zero when today is already over budget', () => {
    expect(streakDays({ ...daily, '2026-10-13': 15 }, 14, at(13))).toBe(0);
  });

  it('summarises today for the popup', () => {
    expect(habitSummary({ '2026-10-13': 9 }, 14, at(13))).toEqual({ todayPct: 9, budgetPct: 14, over: false, streak: 1 });
  });
});
