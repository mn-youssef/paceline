import type { DashboardProject } from '@paceline/shared';
import type { Bar } from './model';

export const totalTokens = (t: DashboardProject['tokens']): number => t.input + t.output + t.cacheRead + t.cacheWrite;

/** Whole percents; a share that would round to 0 but isn't 0 shows as <1%. */
export function percent(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%';
  const pct = (part / total) * 100;
  return pct < 0.5 ? '<1%' : `${Math.round(pct)}%`;
}

/** The largest non-zero entries, biggest first, and how many non-zero entries were left out. */
export function topEntries(rec: Record<string, number>, limit = 5): { items: Bar[]; more: number } {
  const all = Object.entries(rec)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  return { items: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}
