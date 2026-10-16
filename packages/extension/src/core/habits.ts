import { SAME_CYCLE_MS } from './alerts';
import type { Reading } from './readings';
import { DEFAULT_SETTINGS } from './settings';

/** Weekly-limit % used per local day ("YYYY-MM-DD"). */
export type DailyUsage = Record<string, number>;

export const DAILY_USAGE_DAYS = 120;

const pad = (n: number) => String(n).padStart(2, '0');

export function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local day `daysAgo` days before the one containing `now` (anchored at noon so DST never skips a day). */
export function dayKeyBefore(now: number, daysAgo: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return localDayKey(d.getTime());
}

export function addDailyUsage(daily: DailyUsage, prev: Reading | undefined, next: Reading): DailyUsage {
  const a = prev?.sevenDay;
  const b = next.sevenDay;
  if (!a || !b || a.resetsAt === null || b.resetsAt === null) return daily;
  // Usage before a weekly reset was never read after the last reading, so a rise across it is unknowable.
  if (Math.abs(a.resetsAt - b.resetsAt) > SAME_CYCLE_MS) return daily;
  const rise = b.pct - a.pct;
  if (rise <= 0) return daily;
  const key = localDayKey(next.t);
  return { ...daily, [key]: (daily[key] ?? 0) + rise };
}

/**
 * The highest weekly reading so far in next's cycle. Rises are measured from it, so readings from the
 * status line and claude.ai that disagree slightly never count the same usage twice.
 */
export function cycleHigh(readings: Reading[], next: Reading): Reading | undefined {
  const cycle = next.sevenDay?.resetsAt;
  if (cycle === null || cycle === undefined) return undefined;
  let high: Reading | undefined;
  for (const r of readings) {
    const w = r.sevenDay;
    if (r.t >= next.t || !w || w.resetsAt === null || Math.abs(w.resetsAt - cycle) > SAME_CYCLE_MS) continue;
    if (!high || w.pct > high.sevenDay!.pct) high = r;
  }
  return high;
}

export function pruneDaily(daily: DailyUsage, now: number, keepDays = DAILY_USAGE_DAYS): DailyUsage {
  const cutoff = dayKeyBefore(now, keepDays - 1);
  return Object.fromEntries(Object.entries(daily).filter(([day]) => day >= cutoff));
}

/** Days at or under budget, counting back from today; days without use neither break nor extend it. */
export function streakDays(daily: DailyUsage, budgetPct: number, now: number): number {
  let streak = 0;
  for (let i = 0; i < DAILY_USAGE_DAYS; i++) {
    const used = daily[dayKeyBefore(now, i)] ?? 0;
    if (used <= 0) continue;
    if (used > budgetPct) break;
    streak++;
  }
  return streak;
}

/** "14%", or "14.4%" when a whole number would hide which side of the budget the figure is on. */
export function formatBudgetPct(used: number, budgetPct: number): string {
  const whole = Math.round(used);
  return whole === budgetPct && used !== budgetPct ? `${used.toFixed(1)}%` : `${whole}%`;
}

export interface HabitSummary {
  todayPct: number;
  budgetPct: number;
  over: boolean;
  streak: number;
}

export function habitSummary(daily: DailyUsage, budgetPct: number, now: number): HabitSummary {
  const todayPct = daily[localDayKey(now)] ?? 0;
  return { todayPct, budgetPct, over: todayPct > budgetPct, streak: streakDays(daily, budgetPct, now) };
}

export const NO_HABITS: HabitSummary = { todayPct: 0, budgetPct: DEFAULT_SETTINGS.dailyBudgetPct, over: false, streak: 0 };
