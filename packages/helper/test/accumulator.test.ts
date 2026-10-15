import { describe, expect, it } from 'vitest';
import { applyEvent, newAccState } from '../src/parse/accumulator';
import { MIN, SEC, T0, call, compact, results, run, turn } from './fixtures/events';

describe('accumulator', () => {
  it('counts usage once per message id and gathers tools from every content line', () => {
    const s = run([
      turn({ id: 'a1', at: 0, usage: { input: 100, output: 50 }, tools: [call('t1', 'Read', '/a.ts')] }),
      turn({ id: 'a1', at: 0, usage: { input: 100, output: 50 }, tools: [call('t2', 'Bash')] }),
    ]);
    expect(s.tokens).toEqual({ input: 100, output: 50, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
    expect(s.turns).toBe(1);
    expect(s.toolStats.read.calls).toBe(1);
    expect(s.toolStats.bash.calls).toBe(1);
  });

  it('counts the final usage when later lines of a streamed message report more output', () => {
    const s = run(
      [
        turn({ id: 'a1', at: 0, usage: { input: 10, output: 3 }, sidechain: true }),
        turn({ id: 'a1', at: 0, usage: { input: 10, output: 1_186 }, sidechain: true, tools: [call('t1', 'Bash')] }),
      ],
      { subagent: true },
    );
    expect(s.tokens.output).toBe(1_186);
    expect(s.costUsd).toBeCloseTo((10 * 4 + 1_186 * 20) / 1e6, 12);
    expect(s.subagentCostUsd).toBeCloseTo(s.costUsd, 12);
    expect(s.costByModel['claude-opus-5-5']).toBeCloseTo(s.costUsd, 12);
  });

  it('splits spend and waste signals by clock hour', () => {
    const h0 = String(Math.floor(T0 / 3_600_000));
    const h1 = String(Math.floor(T0 / 3_600_000) + 1);
    const s = run([
      turn({ id: 'a1', at: 0, usage: { input: 100_000, output: 0 } }),
      turn({ id: 'a2', at: 6 * MIN, usage: { cacheWrite5m: 60_000, cacheRead: 200_000 } }),
      turn({ id: 'b1', at: 7 * MIN, usage: { input: 1_000_000, output: 0 }, sidechain: true }),
      turn({ id: 'a3', at: 61 * MIN, usage: { cacheWrite5m: 60_000 } }),
    ]);
    expect(s.hourly[h0]).toMatchObject({ turns: 2, longCtxTurns: 1, cacheMisses: 1, cacheMissTokens: 60_000, subagentCostUsd: expect.closeTo(4, 9) });
    expect(s.hourly[h1]).toMatchObject({ turns: 1, longCtxTurns: 0, cacheMisses: 1, subagentCostUsd: 0 });
    const sum = Object.values(s.hourly).reduce((t, h) => t + h.costUsd, 0);
    expect(sum).toBeCloseTo(s.costUsd, 12);
  });

  it('prices turns by model and buckets cost by hour', () => {
    const s = run([turn({ id: 'a1', at: 0, usage: { input: 1_000_000, output: 0 } })]);
    expect(s.costUsd).toBeCloseTo(4, 9);
    expect(s.costByModel).toEqual({ 'claude-opus-5-5': expect.closeTo(4, 9) });
    const h0 = String(Math.floor(T0 / 3_600_000));
    expect(Object.keys(s.hourly)).toEqual([h0]);
    expect(s.hourly[h0]!.costUsd).toBeCloseTo(4, 9);
  });

  it('treats inline sidechain turns as subagent cost without touching context stats', () => {
    const s = run([
      turn({ id: 'a1', at: 0, usage: { input: 1_000_000, output: 0 } }),
      turn({ id: 'b1', at: SEC, usage: { input: 1_000_000, output: 0 }, sidechain: true }),
    ]);
    expect(s.costUsd).toBeCloseTo(8, 9);
    expect(s.subagentCostUsd).toBeCloseTo(4, 9);
    expect(s.turns).toBe(1);
    expect(s.contexts).toEqual([1_000_000]);
  });

  it('books a subagent file entirely as subagent cost', () => {
    const s = run([turn({ id: 'a1', at: 0, usage: { input: 1_000_000, output: 0 }, sidechain: true })], { subagent: true });
    expect(s.subagentCostUsd).toBeCloseTo(4, 9);
    expect(s.turns).toBe(0);
    expect(s.contexts).toEqual([]);
  });

  it('charges tool output for every later turn it stays in context', () => {
    const s = run([
      turn({ id: 'a1', at: 0, tools: [call('t1', 'Read', '/x.ts')] }),
      results(SEC, [['t1', 10_000]]),
      turn({ id: 'a2', at: 2 * SEC }),
      turn({ id: 'a3', at: 3 * SEC }),
      turn({ id: 'a4', at: 4 * SEC }),
    ]);
    // One 5-minute cache write at $5/M, then three reads at $0.20/M (Opus 5.5).
    expect(s.residencyUsd['cat:read']).toBeCloseTo(10_000 * 5e-6 + 3 * 10_000 * 0.2e-6, 12);
    expect(s.toolStats.read.outputTokens).toBe(10_000);
  });

  it('stops charging residency after a compaction', () => {
    const s = run([
      turn({ id: 'a1', at: 0, tools: [call('t1', 'Read', '/x.ts')] }),
      results(SEC, [['t1', 10_000]]),
      turn({ id: 'a2', at: 2 * SEC }),
      compact(2.5 * SEC),
      turn({ id: 'a3', at: 3 * SEC }),
    ]);
    expect(s.residencyUsd['cat:read']).toBeCloseTo(10_000 * 5e-6 + 10_000 * 0.2e-6, 12);
    expect(s.compactions).toBe(1);
  });

  it('detects cache misses after pauses longer than the 5-minute TTL', () => {
    const w = { cacheWrite5m: 60_000 };
    const s = run([
      turn({ id: 'a1', at: 0 }),
      turn({ id: 'a2', at: 6 * MIN, usage: w }),
      turn({ id: 'a3', at: 12 * MIN, usage: w }),
      turn({ id: 'a4', at: 18 * MIN, usage: w }),
      turn({ id: 'a5', at: 19 * MIN, usage: w }),
    ]);
    expect(s.cacheMisses).toBe(3);
    expect(s.cacheMissTokens).toBe(180_000);
    expect(s.cacheMissSavingUsd).toBeCloseTo((180_000 * (5 - 0.2)) / 1e6, 12);
  });

  it('uses the 1-hour TTL once the session writes 1-hour cache', () => {
    const w = { cacheWrite1h: 60_000 };
    const s = run([
      turn({ id: 'a1', at: 0, usage: w }),
      turn({ id: 'a2', at: 10 * MIN, usage: w }),
      turn({ id: 'a3', at: 75 * MIN, usage: w }),
    ]);
    expect(s.cacheMisses).toBe(1);
    expect(s.cacheMissSavingUsd).toBeCloseTo((60_000 * (8 - 0.2)) / 1e6, 12);
  });

  it('classifies small Opus turns, including the last one still pending', () => {
    const s = run([
      turn({ id: 'a1', at: 0, usage: { output: 500 }, tools: [call('t1', 'Edit')] }),
      turn({ id: 'a2', at: SEC, usage: { output: 3_000 }, tools: [call('t2', 'Edit')] }),
      turn({ id: 'a3', at: 2 * SEC, usage: { output: 200 }, tools: [call('t3', 'WebFetch')] }),
      turn({ id: 'a4', at: 3 * SEC, usage: { output: 100 } }),
    ]);
    expect(s.opusTurns).toBe(4);
    expect(s.opusSmallTurns).toBe(2);
    // Per million: a1 (10*4 + 500*20) - (10*2 + 500*10) = 5020; a4 (10*4 + 100*20) - (10*2 + 100*10) = 1020.
    expect(s.opusSmallSavingUsd).toBeCloseTo((5_020 + 1_020) / 1e6, 12);
  });

  it('accumulates long-context and long-session savings', () => {
    const s = run([turn({ id: 'a1', at: 0, usage: { cacheRead: 200_000 } })]);
    expect(s.longCtxTurns).toBe(1);
    expect(s.longCtxSavingUsd).toBeCloseTo((200_010 - 100_000) * 0.2e-6, 12);
    expect(s.longSessionSavingUsd).toBeCloseTo((200_010 - 40_000) * 0.2e-6, 12);
  });

  it('sums active time from gaps shorter than five minutes', () => {
    const s = run([0, 2, 4, 20, 21].map((m, i) => turn({ id: `a${i}`, at: m * MIN })));
    expect(s.activeMs).toBe(5 * MIN);
  });

  it('tracks re-reads, the largest read, MCP servers and noisy bash output', () => {
    const s = run([
      turn({
        id: 'a1',
        at: 0,
        tools: [
          call('r1', 'Read', '/a.ts'), call('r2', 'Read', '/a.ts'), call('r3', 'Read', '/a.ts'), call('r4', 'Read', '/b.ts'),
          call('m1', 'mcp__figma__get_design'), call('b1', 'Bash'), call('b2', 'Bash'), call('b3', 'Bash'),
        ],
      }),
      results(SEC, [['r1', 100], ['r2', 5_000], ['r3', 200], ['r4', 9_000], ['m1', 30_000], ['b1', 12_000], ['b2', 9_000], ['b3', 15_000]]),
    ]);
    expect(s.fileReads).toEqual({ '/a.ts': 3, '/b.ts': 1 });
    expect(s.largestRead).toEqual({ path: '/b.ts', tokens: 9_000 });
    expect(s.resident.reread).toBe(5_200);
    expect(s.mcpStats).toEqual({ figma: { calls: 1, outputTokens: 30_000 } });
    expect(s.resident['mcp:figma']).toBe(30_000);
    expect(s.bigBashOutputs).toBe(2);
    expect(s.bigBashTokens).toBe(27_000);
  });

  it('counts malformed lines', () => {
    const s = newAccState('s1', false);
    applyEvent(s, { kind: 'malformed' });
    expect(s.malformed).toBe(1);
  });
});
