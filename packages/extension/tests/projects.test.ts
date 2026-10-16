import { describe, expect, it } from 'vitest';
import { makeDashboardProject } from '@paceline/shared/fixtures';
import { budgetStatus, sortProjects, totalTokens } from '../src/dashboard/projects';
import { DEFAULT_SETTINGS, parseProjectBudget } from '../src/core/settings';

describe('parseProjectBudget', () => {
  it('reads dollars, removes the budget when empty, and keeps the old one for bad input', () => {
    expect(parseProjectBudget('100', null)).toBe(100);
    expect(parseProjectBudget(' 25.5 ', 10)).toBe(25.5);
    expect(parseProjectBudget('', 100)).toBeNull();
    expect(parseProjectBudget('-5', 100)).toBe(100);
    expect(parseProjectBudget('abc', 100)).toBe(100);
  });

  it('starts with no budgets', () => {
    expect(DEFAULT_SETTINGS.projectBudgets).toEqual({});
  });
});

describe('budgetStatus', () => {
  it('turns orange from 80% and red above 100%', () => {
    expect(budgetStatus(42, 100)).toEqual({ share: 0.42, tone: 'ok', text: '$42.0 of $100 this month' });
    expect(budgetStatus(80, 100).tone).toBe('near');
    expect(budgetStatus(100, 100).tone).toBe('near');
    expect(budgetStatus(120, 100)).toEqual({ share: 1.2, tone: 'over', text: '$120 of $100 this month · over by $20.0' });
  });
});

describe('sortProjects', () => {
  const a = makeDashboardProject({ name: 'a', costUsd: 5, monthToDateUsd: 50, tokens: { input: 1, output: 1, cacheRead: 9_000_000, cacheWrite: 0 } });
  const b = makeDashboardProject({ name: 'b', costUsd: 9, monthToDateUsd: 90, tokens: { input: 1, output: 1, cacheRead: 1_000, cacheWrite: 0 } });
  const c = makeDashboardProject({ name: 'c', costUsd: 1, monthToDateUsd: 10 });
  const names = (rows: { name: string }[]) => rows.map((r) => r.name);

  it('sorts by API value, by total tokens, or by budget use with unbudgeted projects last', () => {
    expect(names(sortProjects([a, b, c], 'value', {}))).toEqual(['b', 'a', 'c']);
    expect(names(sortProjects([a, b, c], 'tokens', {}))).toEqual(['a', 'c', 'b']);
    expect(names(sortProjects([a, b, c], 'budget', { a: 100, c: 10 }))).toEqual(['c', 'a', 'b']);
  });

  it('adds up all four token counts', () => {
    expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10);
  });
});
