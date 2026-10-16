import { gradeFor, type DashboardData, type DashboardSession, type Grade, type ToolCategory } from '@paceline/shared';
import { formatUsd } from '../core/format';
import { dayKeyBefore, type DailyUsage } from '../core/habits';
import type { Plan } from '../core/settings';
import { familyOf, type Family } from '../ui/view';

export const TOP_PROJECTS = 5;
export const OTHER = 'Other';
/** Key of the fold-in series, so a real project called "Other" keeps its own entry. */
export const OTHER_KEY = '__other__';

export interface Stacked {
  /** The top projects by total, largest first, then "Other" when more exist. Colours follow this order. */
  series: { key: string; name: string; total: number }[];
  /** One value per series for each day. */
  days: { day: string; values: number[] }[];
}

export function stackByProject(days: DashboardData['days'], top = TOP_PROJECTS): Stacked {
  const totals = new Map<string, number>();
  for (const d of days) for (const [p, c] of Object.entries(d.byProject)) totals.set(p, (totals.get(p) ?? 0) + c);
  const ranked = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const named = ranked.slice(0, top);
  const rest = ranked.slice(top);
  const series = named.map(([name, total]) => ({ key: name, name, total }));
  if (rest.length > 0) series.push({ key: OTHER_KEY, name: OTHER, total: rest.reduce((s, [, c]) => s + c, 0) });
  const slot = new Map(named.map(([name], i) => [name, i]));
  return {
    series,
    days: days.map((d) => {
      const values = new Array<number>(series.length).fill(0);
      for (const [p, c] of Object.entries(d.byProject)) {
        const i = slot.get(p) ?? named.length;
        values[i] = (values[i] ?? 0) + c;
      }
      return { day: d.day, values };
    }),
  };
}

export const PLAN_PRICES: Record<Exclude<Plan, 'api'>, number> = { pro: 20, max5: 100, max20: 200 };

export function planComparison(monthToDateUsd: number, plan: Plan): string {
  const value = `This month: ${formatUsd(monthToDateUsd)} of API value`;
  if (plan === 'api') return value;
  const price = PLAN_PRICES[plan];
  return `${value} on your $${price} plan (${(monthToDateUsd / price).toFixed(1)}×)`;
}

export type SortKey = 'date' | 'duration' | 'cost' | 'grade';

const SORT_VALUE: Record<SortKey, (s: DashboardSession) => number> = {
  date: (s) => s.startedAt,
  duration: (s) => s.durationMin,
  cost: (s) => s.costUsd,
  grade: (s) => s.score,
};

export function sortSessions(rows: DashboardSession[], key: SortKey, dir: 'asc' | 'desc'): DashboardSession[] {
  const value = SORT_VALUE[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * (value(a) - value(b)));
}

const CSV_HEADER = 'project,started,duration_min,turns,api_value_usd,grade,score,tips';

function csvField(v: string | number): string {
  let s = String(v);
  // Spreadsheets evaluate a cell that starts with = + - @ as a formula.
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: DashboardSession[]): string {
  const lines = rows.map((r) =>
    [r.projectName, new Date(r.startedAt).toISOString(), Math.round(r.durationMin), r.turns, r.costUsd.toFixed(2), r.grade, r.score, r.tips.map((t) => t.title).join('; ')]
      .map(csvField)
      .join(','),
  );
  return [CSV_HEADER, ...lines].join('\r\n') + '\r\n';
}

/** Cost-weighted: an expensive sloppy session counts for more than a cheap tidy one. */
export function averageGrade(rows: DashboardSession[]): { score: number; grade: Grade } | null {
  const cost = rows.reduce((s, r) => s + r.costUsd, 0);
  if (cost <= 0) return null;
  const score = Math.round(rows.reduce((s, r) => s + r.score * r.costUsd, 0) / cost);
  return { score, grade: gradeFor(score) };
}

export const HEAT_STEPS = 5;

export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(HEAT_STEPS, Math.max(1, Math.ceil((value / max) * HEAT_STEPS)));
}

export interface Bar {
  label: string;
  value: number;
}

const bySize = (bars: Bar[]) => bars.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
const FAMILY_LABELS: Record<Family, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable', other: 'Other' };

export function modelBars(byModel: Record<string, number>): Bar[] {
  const totals = new Map<string, number>();
  for (const [model, usd] of Object.entries(byModel)) {
    const label = FAMILY_LABELS[familyOf(model)];
    totals.set(label, (totals.get(label) ?? 0) + usd);
  }
  return bySize([...totals].map(([label, value]) => ({ label, value })));
}

export function categoryBars(byCategory: Record<ToolCategory, number>): Bar[] {
  return bySize(Object.entries(byCategory).map(([label, value]) => ({ label, value })));
}

export function topCategory(byCategory: Record<ToolCategory, number>): ToolCategory | null {
  return (categoryBars(byCategory)[0]?.label as ToolCategory | undefined) ?? null;
}

export function topProject(days: DashboardData['days']): string | null {
  return stackByProject(days, 1).series[0]?.name ?? null;
}

export type HabitState = 'under' | 'over' | 'none';

export function habitCells(daily: DailyUsage, budgetPct: number, now: number, days = 30): { day: string; used: number; state: HabitState }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = dayKeyBefore(now, days - 1 - i);
    const used = daily[day] ?? 0;
    const state: HabitState = used <= 0 ? 'none' : used > budgetPct ? 'over' : 'under';
    return { day, used, state };
  });
}
