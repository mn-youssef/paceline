import { describe, expect, it } from 'vitest';
import { makeDashboard, makeDashboardSession } from '@paceline/shared/fixtures';
import { shareCardModel } from '../src/dashboard/shareCard';

const data = makeDashboard({
  range: '7d',
  days: [{ day: '2026-10-12', costUsd: 40, sessions: 2, byProject: { 'client-secret': 30, web: 10 } }],
  byCategory: { ...makeDashboard().byCategory, read: 900, bash: 300 },
  sessions: [makeDashboardSession({ costUsd: 30, score: 90 }), makeDashboardSession({ sessionId: 's2', costUsd: 10, score: 50 })],
});

describe('shareCardModel', () => {
  it('sums up the range and leaves project names out by default', () => {
    expect(shareCardModel(data, 5, false)).toEqual({
      title: 'My week with Claude Code',
      value: '$40',
      caption: 'of API value in the last 7 days',
      facts: [
        { label: 'Sessions', value: '2' },
        { label: 'Efficiency', value: 'B' },
        { label: 'Budget streak', value: '5 days' },
        { label: 'Top tool', value: 'read' },
      ],
    });
  });

  it('adds the top project only when allowed, and drops an empty streak', () => {
    expect(shareCardModel(data, 0, true).facts).toEqual([
      { label: 'Sessions', value: '2' },
      { label: 'Efficiency', value: 'B' },
      { label: 'Top tool', value: 'read' },
      { label: 'Top project', value: 'client-secret' },
    ]);
  });

  it('marks a capped session count', () => {
    expect(shareCardModel({ ...data, truncated: true }, 0, false).facts[0]).toEqual({ label: 'Sessions', value: '2+' });
  });
});
