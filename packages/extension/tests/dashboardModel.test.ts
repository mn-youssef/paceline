import { describe, expect, it } from 'vitest';
import { TOOL_CATEGORIES, type DashboardSession, type ToolCategory } from '@paceline/shared';
import { makeDashboardSession } from '@paceline/shared/fixtures';
import {
  averageGrade,
  OTHER_KEY,
  categoryBars,
  habitCells,
  heatLevel,
  modelBars,
  planComparison,
  sortSessions,
  stackByProject,
  toCsv,
  topCategory,
  topProject,
} from '../src/dashboard/model';

const day = (d: string, byProject: Record<string, number>) => ({ day: d, costUsd: Object.values(byProject).reduce((s, c) => s + c, 0), sessions: 1, byProject });
const noCategories = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>;

describe('stackByProject', () => {
  it('folds projects beyond the top five into Other', () => {
    const s = stackByProject([day('2026-10-12', { a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 }), day('2026-10-13', { g: 0.5, a: 1 })]);
    expect(s.series).toEqual([
      { key: 'a', name: 'a', total: 7 },
      { key: 'b', name: 'b', total: 5 },
      { key: 'c', name: 'c', total: 4 },
      { key: 'd', name: 'd', total: 3 },
      { key: 'e', name: 'e', total: 2 },
      { key: OTHER_KEY, name: 'Other', total: 1.5 },
    ]);
    expect(s.days[1]).toEqual({ day: '2026-10-13', values: [1, 0, 0, 0, 0, 0.5] });
  });

  it('keeps a real project called "Other" apart from the fold-in', () => {
    const s = stackByProject([day('2026-10-12', { Other: 9, a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 })]);
    expect(s.series.map((x) => x.key)).toEqual(['Other', 'a', 'b', 'c', 'd', OTHER_KEY]);
  });

  it('has no Other series with five projects or fewer', () => {
    expect(stackByProject([day('2026-10-13', { a: 1 })]).series.map((x) => x.name)).toEqual(['a']);
  });
});

describe('planComparison', () => {
  it('compares this month with the plan price, or not at all on the API', () => {
    expect(planComparison(412, 'max5')).toBe('This month: $412 of API value on your $100 plan (4.1×)');
    expect(planComparison(412, 'api')).toBe('This month: $412 of API value');
  });
});

describe('sortSessions', () => {
  const rows = [
    makeDashboardSession({ sessionId: 'a', costUsd: 1, score: 90, startedAt: 3, durationMin: 5 }),
    makeDashboardSession({ sessionId: 'b', costUsd: 3, score: 40, startedAt: 1, durationMin: 50 }),
    makeDashboardSession({ sessionId: 'c', costUsd: 2, score: 70, startedAt: 2, durationMin: 20 }),
  ];
  const ids = (r: DashboardSession[]) => r.map((x) => x.sessionId);

  it('sorts by each column in either direction without touching the input', () => {
    expect(ids(sortSessions(rows, 'cost', 'desc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortSessions(rows, 'date', 'asc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortSessions(rows, 'duration', 'desc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortSessions(rows, 'grade', 'desc'))).toEqual(['a', 'c', 'b']);
    expect(ids(rows)).toEqual(['a', 'b', 'c']);
  });
});

describe('toCsv', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv([makeDashboardSession({ projectName: 'a,"b"\nc', tips: [{ ruleId: 'x', title: 'Long, long context' }] })]);
    const [header, line, end] = csv.split('\r\n');
    expect(header).toBe('project,started,duration_min,turns,api_value_usd,grade,score,tips');
    expect(line).toBe('"a,""b""\nc",2026-10-12T09:00:00.000Z,60,12,2.00,B,80,"Long, long context"');
    expect(end).toBe('');
  });

  it('keeps spreadsheet formulas inert', () => {
    expect(toCsv([makeDashboardSession({ projectName: '=HYPERLINK("x")' })]).split('\r\n')[1]).toMatch(/^"'=HYPERLINK\(""x""\)",/);
  });
});

describe('averageGrade', () => {
  it('weights each session by its cost', () => {
    expect(averageGrade([makeDashboardSession({ costUsd: 3, score: 90 }), makeDashboardSession({ costUsd: 1, score: 50 })])).toEqual({ score: 80, grade: 'B' });
    expect(averageGrade([])).toBeNull();
  });
});

describe('heatLevel', () => {
  it('uses step 0 only for no use and step 5 for the busiest cell', () => {
    expect([0, 0.01, 2, 5, 10].map((v) => heatLevel(v, 10))).toEqual([0, 1, 1, 3, 5]);
  });
});

describe('bars and tops', () => {
  it('groups models by family and orders bars by size', () => {
    expect(modelBars({ 'claude-opus-5-5': 3, 'claude-opus-5': 1, 'claude-sonnet-5-5': 2 })).toEqual([
      { label: 'Opus', value: 4 },
      { label: 'Sonnet', value: 2 },
    ]);
    expect(categoryBars({ ...noCategories, read: 500, mcp: 900 })).toEqual([
      { label: 'mcp', value: 900 },
      { label: 'read', value: 500 },
    ]);
  });

  it('names the top category and project, or nothing', () => {
    expect(topCategory({ ...noCategories, read: 500, mcp: 900 })).toBe('mcp');
    expect(topCategory(noCategories)).toBeNull();
    expect(topProject([day('2026-10-12', { a: 1, b: 2 }), day('2026-10-13', { a: 2 })])).toBe('a');
    expect(topProject([])).toBeNull();
  });
});

describe('habitCells', () => {
  it('marks each of the last 30 days under, over or without use', () => {
    const cells = habitCells({ '2026-10-13': 9, '2026-10-12': 20 }, 14, new Date(2026, 9, 13, 15).getTime());
    expect(cells).toHaveLength(30);
    expect(cells.at(-1)).toEqual({ day: '2026-10-13', used: 9, state: 'under' });
    expect(cells.at(-2)).toEqual({ day: '2026-10-12', used: 20, state: 'over' });
    expect(cells[0]).toEqual({ day: '2026-09-14', used: 0, state: 'none' });
  });
});
