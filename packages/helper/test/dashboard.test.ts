import { describe, expect, it } from 'vitest';
import { MAX_DASHBOARD_SESSIONS, buildDashboard } from '../src/analysis/dashboard';
import { emptyHour } from '../src/parse/accumulator';
import { NO_OVERHEAD, makeAgg } from './fixtures/aggregate';
import { fixedOffsetClock } from './fixtures/clock';

const H = 3_600_000;
const hourKey = (iso: string) => String(Date.parse(iso) / H);
const cost = (usd: number) => ({ ...emptyHour(), costUsd: usd });
const NOW = Date.parse('2026-10-13T12:00:00Z'); // Tuesday 14:00 at UTC+2
const CLOCK = fixedOffsetClock(120);
const none = () => NO_OVERHEAD;

const regx = makeAgg({
  sessionId: 'a',
  projectPath: '/x/regx',
  costUsd: 5,
  costByModel: { 'claude-opus-5-5': 5 },
  hourly: { [hourKey('2026-10-12T21:00:00Z')]: cost(2), [hourKey('2026-10-12T22:00:00Z')]: cost(3) },
});
const web = makeAgg({
  sessionId: 'b',
  projectPath: '/x/web',
  costUsd: 10,
  costByModel: { 'claude-sonnet-5-5': 10 },
  hourly: { [hourKey('2026-10-01T10:00:00Z')]: cost(5), [hourKey('2026-09-30T23:00:00Z')]: cost(1), [hourKey('2026-09-30T21:00:00Z')]: cost(4) },
});

describe('buildDashboard', () => {
  it('buckets by the local clock', () => {
    const d = buildDashboard([regx, web], '7d', NOW, none, CLOCK);
    expect(d.days.map((x) => x.day)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    // 21:00Z is Monday 23:00 local; 22:00Z is Tuesday 00:00 local.
    expect(d.days.at(-2)).toEqual({ day: '2026-10-12', costUsd: 2, sessions: 1, byProject: { regx: 2 } });
    expect(d.days.at(-1)).toEqual({ day: '2026-10-13', costUsd: 3, sessions: 1, byProject: { regx: 3 } });
    expect(d.heatmap[1]![23]).toBe(2);
    expect(d.heatmap[2]![0]).toBe(3);
  });

  it('adds up this month whatever the range, and lists graded sessions', () => {
    const week = buildDashboard([regx, web], '7d', NOW, none, CLOCK);
    expect(week.monthToDateUsd).toBe(11); // regx 5 + web 5 (Oct 1 12:00) + 1 (Oct 1 01:00 local); Sep 30 local excluded
    expect(week.sessions.map((s) => [s.sessionId, s.costUsd, s.grade])).toEqual([['a', 5, expect.stringMatching(/^[A-F]$/)]]);
    expect(week.byModel).toEqual({ 'claude-opus-5-5': 5 });
    const month = buildDashboard([regx, web], '30d', NOW, none, CLOCK);
    expect(month.sessions.map((s) => [s.sessionId, s.costUsd])).toEqual([['b', 10], ['a', 5]]);
    expect(month.days.find((x) => x.day === '2026-10-01')?.costUsd).toBe(6);
  });

  it('caps the table at 500 sessions', () => {
    const many = Array.from({ length: MAX_DASHBOARD_SESSIONS + 1 }, (_, i) =>
      makeAgg({ sessionId: `s${i}`, projectPath: '/x/p', costUsd: 1, hourly: { [hourKey('2026-10-13T08:00:00Z')]: cost(1) } }),
    );
    const d = buildDashboard(many, '7d', NOW, none, CLOCK);
    expect(d.sessions).toHaveLength(MAX_DASHBOARD_SESSIONS);
    expect(d.truncated).toBe(true);
  });
});
