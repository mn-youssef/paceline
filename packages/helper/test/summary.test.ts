import { describe, expect, it } from 'vitest';
import { aggregateSessions, computeTotals, median, toSummary, windowCost, windowSums } from '../src/analysis/summary';
import { emptyHour } from '../src/parse/accumulator';
import { MIN, SEC, T0, call, results, run, turn } from './fixtures/events';

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('aggregateSessions', () => {
  it('merges subagent logs into their parent session', () => {
    const main = run([
      turn({ id: 'a1', at: 0, usage: { input: 1_000_000, output: 0 } }),
      turn({ id: 'a2', at: 10 * MIN, usage: { input: 1_000_000, output: 0, cacheRead: 50_000 } }),
    ]);
    const sub = run(
      [
        turn({ id: 'b1', at: 5 * MIN, usage: { input: 500_000, output: 0 }, sidechain: true, tools: [call('t1', 'Read', '/x.ts')] }),
        results(6 * MIN, [['t1', 4_000]], true),
      ],
      { subagent: true },
    );
    const [a] = aggregateSessions([main, sub]);
    expect(a).toMatchObject({
      sessionId: 's1',
      projectPath: '/Users/dev/my-app',
      turns: 2,
      durationMin: 10,
      costUsd: expect.closeTo(10.01, 9),
      subagentCostUsd: expect.closeTo(2, 9),
      peakContext: 1_050_000,
      medianContext: 1_025_000,
      mainModel: 'claude-opus-5-5',
    });
    expect(a!.tools.read).toEqual({ calls: 1, outputTokens: 4_000 });
  });

  it('skips sessions without billable turns', () => {
    expect(aggregateSessions([run([results(0, [])])])).toEqual([]);
  });
});

describe('windowCost and windowSums', () => {
  const h = (over: Partial<ReturnType<typeof emptyHour>>) => ({ ...emptyHour(), ...over });

  it('counts hour buckets that overlap the window', () => {
    expect(windowCost({ '10': h({ costUsd: 1 }), '11': h({ costUsd: 2 }), '12': h({ costUsd: 4 }) }, 11.5 * 3_600_000)).toBe(6);
  });

  it('sums every counter of the overlapping hours', () => {
    const hourly = { '10': h({ turns: 5, cacheMisses: 1 }), '11': h({ turns: 3, cacheMisses: 2, longCtxTurns: 1 }) };
    expect(windowSums(hourly, 11 * 3_600_000)).toEqual(h({ turns: 3, cacheMisses: 2, longCtxTurns: 1 }));
  });
});

describe('toSummary', () => {
  it('shapes an aggregate for the extension', () => {
    const [a] = aggregateSessions([
      run([turn({ id: 'a1', at: 0, tools: [call('t1', 'mcp__figma__get')] }), results(SEC, [['t1', 2_000]]), turn({ id: 'a2', at: 2 * SEC })]),
    ]);
    const s = toSummary(a!, T0 - 1, []);
    expect(s).toMatchObject({
      projectName: 'my-app',
      tokens: { input: 20, output: 200, cacheRead: 0, cacheWrite: 0 },
      windowCostUsd: expect.closeTo(a!.costUsd, 12),
    });
    expect(s.mcpServers.figma).toMatchObject({ calls: 1, outputTokens: 2_000 });
    expect(s.mcpServers.figma!.residencyUsd).toBeGreaterThan(0);
    expect(s.tools.mcp.residencyUsd).toBeGreaterThan(0);
  });
});

describe('computeTotals', () => {
  it('sums window cost and splits it across models', () => {
    const aggs = aggregateSessions([run([turn({ id: 'a1', at: 0, usage: { input: 1_000_000, output: 0 } })])]);
    const t = computeTotals(aggs, T0 - 1);
    expect(t.costUsd).toBeCloseTo(4, 9);
    expect(t.sessions).toBe(1);
    expect(t.byModel['claude-opus-5-5']).toBeCloseTo(4, 9);
  });
});
