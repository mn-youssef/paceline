import type { LocalClock } from '../../src/analysis/dashboard';

/** A clock for a fixed UTC offset, independent of the machine running the tests. */
export function fixedOffsetClock(offsetMin: number): LocalClock {
  const shift = (ts: number) => new Date(ts + offsetMin * 60_000);
  return {
    dayKey: (ts) => shift(ts).toISOString().slice(0, 10),
    weekday: (ts) => shift(ts).getUTCDay(),
    hour: (ts) => shift(ts).getUTCHours(),
    startOfDay: (ts) => {
      const d = shift(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMin * 60_000;
    },
    startOfMonth: (ts) => {
      const d = shift(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - offsetMin * 60_000;
    },
    addDays: (dayStart, n) => dayStart + n * 86_400_000,
  };
}
