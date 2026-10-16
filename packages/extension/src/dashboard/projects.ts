import type { DashboardProject } from '@paceline/shared';
import { formatUsd } from '../core/format';

export type BudgetTone = 'ok' | 'near' | 'over';

/** This month's API value against the project's monthly budget: orange from 80 %, red above 100 %. */
export function budgetStatus(spentUsd: number, budgetUsd: number): { share: number; tone: BudgetTone; text: string } {
  const share = budgetUsd > 0 ? spentUsd / budgetUsd : 0;
  const tone: BudgetTone = share > 1 ? 'over' : share >= 0.8 ? 'near' : 'ok';
  const over = tone === 'over' ? ` · over by ${formatUsd(spentUsd - budgetUsd)}` : '';
  return { share, tone, text: `${formatUsd(spentUsd)} of ${formatUsd(budgetUsd)} this month${over}` };
}

export const totalTokens = (t: DashboardProject['tokens']): number => t.input + t.output + t.cacheRead + t.cacheWrite;

export type ProjectSortKey = 'value' | 'tokens' | 'budget';

/** Largest first; by budget use, projects without a budget come last. */
export function sortProjects(rows: DashboardProject[], key: ProjectSortKey, budgets: Record<string, number>): DashboardProject[] {
  const value = (p: DashboardProject): number => {
    if (key === 'value') return p.costUsd;
    if (key === 'tokens') return totalTokens(p.tokens);
    const budget = budgets[p.name];
    return budget ? p.monthToDateUsd / budget : -1;
  };
  return [...rows].sort((a, b) => value(b) - value(a));
}
