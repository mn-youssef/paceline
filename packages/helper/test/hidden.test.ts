import { describe, expect, it } from 'vitest';
import { computeHiddenCosts } from '../src/analysis/hidden';
import { emptyHour } from '../src/parse/accumulator';
import { NO_OVERHEAD, makeAgg } from './fixtures/aggregate';

const H = 3_600_000;
const WINDOW_START = 10 * H;

const a = makeAgg({
  sessionId: 'a',
  projectPath: '/code/shop',
  firstTurnContext: 78_000,
  mainModel: 'claude-opus-5-5',
  hourly: {
    '9': { ...emptyHour(), costUsd: 50, turns: 100, cacheMisses: 5, cacheMissTokens: 500_000, cacheMissSavingUsd: 2 },
    '10': { ...emptyHour(), costUsd: 10, subagentCostUsd: 4, turns: 20, longCtxTurns: 10, longCtxSavingUsd: 1.5, cacheMisses: 2, cacheMissTokens: 200_000, cacheMissSavingUsd: 0.8 },
  },
});
const b = makeAgg({
  sessionId: 'b',
  projectPath: '/code/web',
  firstTurnContext: 30_000,
  mainModel: 'claude-sonnet-5-5',
  hourly: { '11': { ...emptyHour(), costUsd: 5, turns: 30, cacheMisses: 1, cacheMissTokens: 60_000, cacheMissSavingUsd: 0.3 } },
});
const overhead = (cwd: string) =>
  cwd === '/code/shop' ? { claudeMd: [], claudeMdTokens: 6_000, mcpServers: Array.from({ length: 14 }, (_, i) => `s${i}`) } : NO_OVERHEAD;

describe('computeHiddenCosts', () => {
  const hc = computeHiddenCosts([a, b], WINDOW_START, overhead);

  it('counts only hours inside the window', () => {
    expect(hc.cacheMisses).toEqual({
      count: 3,
      tokens: 260_000,
      usd: expect.closeTo(1.1, 9),
      sessions: [
        { sessionId: 'a', projectName: 'shop', usd: 0.8 },
        { sessionId: 'b', projectName: 'web', usd: 0.3 },
      ],
    });
  });

  it('shares subagent cost and long-context turns of the window', () => {
    expect(hc.subagents).toEqual({ usd: 4, share: expect.closeTo(4 / 15, 9), sessions: [{ sessionId: 'a', projectName: 'shop', usd: 4 }] });
    expect(hc.longContext).toEqual({ turns: 10, share: expect.closeTo(10 / 50, 9), usd: 1.5, sessions: [{ sessionId: 'a', projectName: 'shop', usd: 1.5 }] });
  });

  it('prices setup overhead per project from in-window turns', () => {
    // shop: (78k - 20k) x $0.20/M x 20 turns; web: (30k - 20k) x $0.20/M x 30 turns
    expect(hc.setupOverhead.projects).toEqual([
      { projectName: 'shop', projectPath: '/code/shop', setupTokens: 78_000, mcpServers: 14, claudeMdTokens: 6_000, usd: expect.closeTo(58_000 * 0.2e-6 * 20, 12) },
      { projectName: 'web', projectPath: '/code/web', setupTokens: 30_000, mcpServers: 0, claudeMdTokens: 0, usd: expect.closeTo(10_000 * 0.2e-6 * 30, 12) },
    ]);
    expect(hc.setupOverhead.usd).toBeCloseTo(58_000 * 0.2e-6 * 20 + 10_000 * 0.2e-6 * 30, 12);
  });

  it('is all zeros for an empty window', () => {
    expect(computeHiddenCosts([], WINDOW_START, () => NO_OVERHEAD)).toEqual({
      cacheMisses: { count: 0, tokens: 0, usd: 0, sessions: [] },
      setupOverhead: { usd: 0, projects: [] },
      subagents: { usd: 0, share: 0, sessions: [] },
      longContext: { turns: 0, share: 0, usd: 0, sessions: [] },
    });
  });
});
