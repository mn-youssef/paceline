import type { DashboardData } from '@paceline/shared';
import { formatUsd } from './format';
import { localDayKey, streakDays, type DailyUsage } from './habits';

export const DIGEST_HOUR = 9;

function plusDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Monday 00:00 local of the week containing ts. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.setHours(0, 0, 0, 0);
}

export function digestTimeOfWeek(ts: number): number {
  return new Date(startOfWeek(ts)).setHours(DIGEST_HOUR, 0, 0, 0);
}

export function nextDigestAt(now: number): number {
  const thisWeek = digestTimeOfWeek(now);
  return thisWeek > now ? thisWeek : digestTimeOfWeek(plusDays(startOfWeek(now), 7));
}

/** The Monday ("YYYY-MM-DD") whose digest is due now, or null. Sent once per week, late if Chrome was closed. */
export function dueDigestWeek(lastDigestWeek: string | null, now: number): string | null {
  if (now < digestTimeOfWeek(now)) return null;
  const week = localDayKey(startOfWeek(now));
  return week === lastDigestWeek ? null : week;
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function buildDigest(dash: DashboardData, daily: DailyUsage, budgetPct: number, now: number): { title: string; message: string } | null {
  const thisMonday = startOfWeek(now);
  const lastStart = plusDays(thisMonday, -7);
  const weekKeys = (from: number) => new Set(Array.from({ length: 7 }, (_, i) => localDayKey(plusDays(from, i))));
  const lastKeys = weekKeys(lastStart);
  const prevKeys = weekKeys(plusDays(thisMonday, -14));
  const lastDays = dash.days.filter((d) => lastKeys.has(d.day));
  const value = lastDays.reduce((s, d) => s + d.costUsd, 0);
  if (value <= 0) return null;
  const prev = dash.days.filter((d) => prevKeys.has(d.day)).reduce((s, d) => s + d.costUsd, 0);
  const change = prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
  const sessions = dash.sessions.filter((s) => s.startedAt >= lastStart && s.startedAt < thisMonday);

  const byProject = new Map<string, number>();
  for (const d of lastDays) for (const [p, c] of Object.entries(d.byProject)) byProject.set(p, (byProject.get(p) ?? 0) + c);
  const top = [...byProject].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const tip = mostCommon(sessions.flatMap((s) => s.tips.map((t) => t.title)));
  const streak = streakDays(daily, budgetPct, now);

  const n = sessions.length;
  const parts = [
    `${formatUsd(value)} of API value across ${n} session${n === 1 ? '' : 's'}${change === null ? '' : ` (${change >= 0 ? '+' : ''}${change}% vs the week before)`}.`,
  ];
  if (top) parts.push(`Top project: ${top}.`);
  if (tip) parts.push(`Most common tip: ${tip}.`);
  if (streak > 0) parts.push(`🔥 ${streak}-day streak.`);
  return { title: 'Your week with Claude Code', message: parts.join(' ') };
}
