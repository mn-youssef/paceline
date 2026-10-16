import { describe, expect, it } from 'vitest';
import { MAX_DASHBOARD_SESSIONS, buildDashboard } from '../src/analysis/dashboard';
import { emptyHour } from '../src/parse/accumulator';
import { NO_OVERHEAD, makeAgg } from './fixtures/aggregate';
import { fixedOffsetClock } from './fixtures/clock';

const H = 3_600_000;
const hourKey = (iso: string) => String(Date.parse(iso) / H);
const cost = (usd: number, tokens = 0) => ({ ...emptyHour(), costUsd: usd, inputTokens: tokens, outputTokens: tokens / 10 });
const NOW = Date.parse('2026-10-13T12:00:00Z'); // Tuesday 14:00 at UTC+2
const CLOCK = fixedOffsetClock(120);
const none = () => NO_OVERHEAD;

const shop = makeAgg({
  sessionId: 'a',
  projectPath: '/x/shop',
  costUsd: 5,
  costByModel: { 'claude-opus-5-5': 5 },
  hourly: { [hourKey('2026-10-12T21:00:00Z')]: cost(2, 1000), [hourKey('2026-10-12T22:00:00Z')]: cost(3, 2000) },
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
    const d = buildDashboard([shop, web], '7d', NOW, none, CLOCK);
    expect(d.days.map((x) => x.day)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    // 21:00Z is Monday 23:00 local; 22:00Z is Tuesday 00:00 local.
    expect(d.days.at(-2)).toEqual({ day: '2026-10-12', costUsd: 2, sessions: 1, byProject: { shop: 2 } });
    expect(d.days.at(-1)).toEqual({ day: '2026-10-13', costUsd: 3, sessions: 1, byProject: { shop: 3 } });
    expect(d.heatmap[1]![23]).toBe(2);
    expect(d.heatmap[2]![0]).toBe(3);
  });

  it('adds up this month whatever the range, and lists graded sessions', () => {
    const week = buildDashboard([shop, web], '7d', NOW, none, CLOCK);
    expect(week.monthToDateUsd).toBe(11); // shop 5 + web 5 (Oct 1 12:00) + 1 (Oct 1 01:00 local); Sep 30 local excluded
    expect(week.sessions.map((s) => [s.sessionId, s.costUsd, s.grade])).toEqual([['a', 5, expect.stringMatching(/^[A-F]$/)]]);
    expect(week.byModel).toEqual({ 'claude-opus-5-5': 5 });
    const month = buildDashboard([shop, web], '30d', NOW, none, CLOCK);
    expect(month.sessions.map((s) => [s.sessionId, s.costUsd])).toEqual([['b', 10], ['a', 5]]);
    expect(month.days.find((x) => x.day === '2026-10-01')?.costUsd).toBe(6);
  });

  it('totals each project for the range and the month', () => {
    const d = buildDashboard([shop, web], '7d', NOW, none, CLOCK);
    expect(d.projects?.map((p) => [p.name, p.sessions, p.costUsd, p.monthToDateUsd])).toEqual([
      ['shop', 1, 5, 5],
      ['web', 0, 0, 6], // no use in the last 7 days, but this month's spend keeps it listed
    ]);
  });

  it('adds up to the same total as the days', () => {
    const d = buildDashboard([shop, web], '30d', NOW, none, CLOCK);
    const byProject = d.projects!.reduce((s, p) => s + p.costUsd, 0);
    expect(byProject).toBeCloseTo(d.days.reduce((s, x) => s + x.costUsd, 0));
  });

  it('reports the tokens of the range', () => {
    const d = buildDashboard([shop, web], '7d', NOW, none, CLOCK);
    expect(d.projects?.[0]?.tokens).toEqual({ input: 3000, output: 300, cacheRead: 0, cacheWrite: 0 });
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

describe('systemClock on the New York fall-back day', () => {
  it('lists each local day once, starts at local midnight, and puts both 01:00 hours in one cell', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const agg = makeAgg({
        sessionId: 'n',
        projectPath: '/x/web',
        costUsd: 7,
        // 04:00Z on Oct 27 is local midnight (EDT): the range's first hour, a week of 24 h steps before Nov 2.
        hourly: { [hourKey('2026-10-27T04:00:00Z')]: cost(4), [hourKey('2026-11-01T05:00:00Z')]: cost(1), [hourKey('2026-11-01T06:00:00Z')]: cost(2) },
      });
      const d = buildDashboard([agg], '7d', Date.parse('2026-11-02T17:00:00Z'), none);
      expect(d.days.map((x) => x.day)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
      expect(d.days.find((x) => x.day === '2026-10-27')?.costUsd).toBe(4);
      expect(d.days.find((x) => x.day === '2026-11-01')?.costUsd).toBe(3);
      expect(d.heatmap[0]![1]).toBe(3);
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});
