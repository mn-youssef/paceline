import { basename } from 'node:path';
import { TOOL_CATEGORIES, type DashboardData, type DashboardRange, type DashboardSession, type ToolCategory } from '@paceline/shared';
import { HOUR_MS } from '../parse/accumulator';
import type { ProjectOverhead } from './overhead';
import type { SessionAggregate } from './summary';
import { assessSession } from './tips';

/** Local calendar arithmetic, injectable so tests do not depend on the machine's time zone. */
export interface LocalClock {
  dayKey(ts: number): string;
  weekday(ts: number): number;
  hour(ts: number): number;
  startOfDay(ts: number): number;
  startOfMonth(ts: number): number;
  addDays(dayStart: number, n: number): number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const systemClock: LocalClock = {
  dayKey: (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  weekday: (ts) => new Date(ts).getDay(),
  hour: (ts) => new Date(ts).getHours(),
  startOfDay: (ts) => new Date(ts).setHours(0, 0, 0, 0),
  startOfMonth: (ts) => {
    const d = new Date(ts);
    d.setDate(1);
    return d.setHours(0, 0, 0, 0);
  },
  addDays: (dayStart, n) => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + n);
    return d.getTime();
  },
};

export const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30 };
export const MAX_DASHBOARD_SESSIONS = 500;

export function buildDashboard(
  aggs: SessionAggregate[],
  range: DashboardRange,
  now: number,
  overheadFor: (cwd: string) => ProjectOverhead,
  clock: LocalClock = systemClock,
  indexing = false,
): DashboardData {
  const n = RANGE_DAYS[range];
  const start = clock.addDays(clock.startOfDay(now), -(n - 1));
  const dayKeys = Array.from({ length: n }, (_, i) => clock.dayKey(clock.addDays(start, i)));
  const days = new Map(dayKeys.map((day) => [day, { day, costUsd: 0, sessions: 0, byProject: {} as Record<string, number> }]));
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const monthStart = clock.startOfMonth(now);
  const byModel: Record<string, number> = {};
  const byCategory = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>;
  const rows: DashboardSession[] = [];
  let monthToDateUsd = 0;

  for (const a of aggs) {
    const name = basename(a.projectPath) || a.projectPath;
    const activeDays = new Set<string>();
    let inRange = 0;
    for (const [key, h] of Object.entries(a.hourly)) {
      const ts = Number(key) * HOUR_MS;
      if (ts >= monthStart) monthToDateUsd += h.costUsd;
      if (ts < start || h.costUsd === 0) continue;
      const day = days.get(clock.dayKey(ts));
      if (!day) continue;
      day.costUsd += h.costUsd;
      day.byProject[name] = (day.byProject[name] ?? 0) + h.costUsd;
      activeDays.add(day.day);
      const row = heatmap[clock.weekday(ts)]!;
      row[clock.hour(ts)] = (row[clock.hour(ts)] ?? 0) + h.costUsd;
      inRange += h.costUsd;
    }
    if (inRange === 0) continue;
    for (const day of activeDays) days.get(day)!.sessions++;
    // Session-level counters are spread by the share of the session's cost that falls in the range.
    const share = a.costUsd > 0 ? inRange / a.costUsd : 0;
    for (const [model, c] of Object.entries(a.costByModel)) byModel[model] = (byModel[model] ?? 0) + c * share;
    for (const c of TOOL_CATEGORIES) byCategory[c] += a.tools[c].outputTokens * share;
    const { tips, score, grade } = assessSession(a, overheadFor(a.projectPath));
    rows.push({
      sessionId: a.sessionId,
      projectName: name,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      durationMin: a.durationMin,
      turns: a.turns,
      costUsd: inRange,
      score,
      grade,
      tips: tips.map((t) => ({ ruleId: t.ruleId, title: t.title })),
    });
  }

  rows.sort((x, y) => y.costUsd - x.costUsd);
  return {
    range,
    days: dayKeys.map((k) => days.get(k)!),
    byModel,
    byCategory,
    heatmap,
    monthToDateUsd,
    sessions: rows.slice(0, MAX_DASHBOARD_SESSIONS),
    truncated: rows.length > MAX_DASHBOARD_SESSIONS,
    indexing,
  };
}
