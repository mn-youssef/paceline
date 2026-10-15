import { describe, expect, it } from 'vitest';
import {
  assessSession, bigReads, cacheMiss, highOverhead, longContext, longSession, mcpHeavy, noisyBash, opusRoutine, reReads, runTips,
  severityFor, subagentHeavy,
} from '../src/analysis/tips';
import { NO_OVERHEAD, makeAgg, toolsWith } from './fixtures/aggregate';

describe('rules', () => {
  it('long-session', () => {
    const tip = longSession(makeAgg({ durationMin: 180, medianContext: 120_000, longSessionSavingUsd: 2 }), NO_OVERHEAD);
    expect(tip).toMatchObject({
      ruleId: 'long-session',
      message: 'This session ran 3h without /clear. Long context (120k tokens) gets re-sent on every message.',
      estSavingUsd: 2,
    });
    expect(longSession(makeAgg({ durationMin: 119, medianContext: 120_000 }), NO_OVERHEAD)).toBeNull();
    expect(longSession(makeAgg({ durationMin: 180, medianContext: 120_000, compactions: 1 }), NO_OVERHEAD)).toBeNull();
  });

  it('big-reads', () => {
    const tip = bigReads(
      makeAgg({ tools: toolsWith({ read: 60_000, bash: 40_000 }), largestRead: { path: '/repo/src/big.ts', tokens: 30_000 }, residencyUsd: { 'cat:read': 1 } }),
      NO_OVERHEAD,
    );
    expect(tip).toMatchObject({
      ruleId: 'big-reads',
      message: '60% of tool tokens were file reads (largest: big.ts at 30k). Point Claude to specific files or line ranges.',
      estSavingUsd: 0.5,
    });
    expect(bigReads(makeAgg({ tools: toolsWith({ read: 39_000, bash: 61_000 }) }), NO_OVERHEAD)).toBeNull();
  });

  it('opus-routine', () => {
    const tip = opusRoutine(makeAgg({ opusCostUsd: 8, opusTurns: 20, opusSmallTurns: 14, opusSmallSavingUsd: 1.5 }), NO_OVERHEAD);
    expect(tip).toMatchObject({
      ruleId: 'opus-routine',
      message: 'Opus used 80% of this session, and 70% of its turns were small edits. Use Sonnet for routine edits (/model sonnet).',
      estSavingUsd: 1.5,
    });
    expect(opusRoutine(makeAgg({ opusCostUsd: 8, opusTurns: 20, opusSmallTurns: 11 }), NO_OVERHEAD)).toBeNull();
  });

  it('mcp-heavy', () => {
    const tip = mcpHeavy(
      makeAgg({ tools: toolsWith({ mcp: 48_000, read: 52_000 }), mcp: { figma: { calls: 3, outputTokens: 48_000 } }, residencyUsd: { 'mcp:figma': 2 } }),
      NO_OVERHEAD,
    );
    expect(tip).toMatchObject({
      ruleId: 'mcp-heavy',
      message: "The figma MCP server returned 48k tokens. Disable servers you don't need in this project.",
      estSavingUsd: 1,
    });
    expect(
      mcpHeavy(makeAgg({ tools: toolsWith({ mcp: 19_000, read: 81_000 }), mcp: { figma: { calls: 1, outputTokens: 19_000 } } }), NO_OVERHEAD),
    ).toBeNull();
  });

  it('cache-miss', () => {
    const tip = cacheMiss(makeAgg({ cacheMisses: 4, cacheMissTokens: 480_000, cacheMissSavingUsd: 3, has1h: true }), NO_OVERHEAD);
    expect(tip).toMatchObject({
      ruleId: 'cache-miss',
      message: 'You paused 4 times; each restart re-sent ~120k tokens. /clear before long breaks, or keep pauses under 60 min.',
      estSavingUsd: 3,
    });
    expect(cacheMiss(makeAgg({ cacheMisses: 2, cacheMissTokens: 200_000 }), NO_OVERHEAD)).toBeNull();
  });

  it('high-overhead', () => {
    const overhead = { claudeMd: [], claudeMdTokens: 9_000, mcpServers: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const tip = highOverhead(makeAgg({ firstTurnContext: 42_000, turns: 100 }), overhead);
    expect(tip).toMatchObject({ ruleId: 'high-overhead', message: 'Every message here starts with 42k tokens of setup: 6 MCP servers, CLAUDE.md 9k.' });
    expect(tip!.estSavingUsd).toBeCloseTo(22_000 * 0.2e-6 * 100, 12);
    expect(highOverhead(makeAgg({ firstTurnContext: 50_000 }), NO_OVERHEAD)?.message).toBe(
      'Every message here starts with 50k tokens of setup: system prompt, tools and skills.',
    );
    expect(highOverhead(makeAgg({ firstTurnContext: 39_999 }), overhead)).toBeNull();
  });

  it('subagent-heavy', () => {
    const tip = subagentHeavy(makeAgg({ subagentCostUsd: 5.5 }), NO_OVERHEAD);
    expect(tip).toMatchObject({ ruleId: 'subagent-heavy', message: 'Subagents used 55% of this session. Give them narrower tasks and ask for shorter reports.' });
    expect(tip!.estSavingUsd).toBeCloseTo(1.65, 12);
    expect(subagentHeavy(makeAgg({ subagentCostUsd: 3.9 }), NO_OVERHEAD)).toBeNull();
  });

  it('noisy-bash', () => {
    const tip = noisyBash(makeAgg({ bigBashOutputs: 3, bigBashTokens: 45_000, residencyUsd: { bigbash: 1 } }), NO_OVERHEAD);
    expect(tip).toMatchObject({ ruleId: 'noisy-bash', message: '3 commands dumped 45k tokens of output. Pipe long logs through tail or grep.', estSavingUsd: 0.8 });
    expect(noisyBash(makeAgg({ bigBashOutputs: 2, bigBashTokens: 30_000 }), NO_OVERHEAD)).toBeNull();
  });

  it('re-reads', () => {
    const tip = reReads(makeAgg({ fileReads: { '/repo/src/auth.ts': 9, '/repo/x.ts': 2 }, residencyUsd: { reread: 0.4 } }), NO_OVERHEAD);
    expect(tip).toMatchObject({ ruleId: 're-reads', message: 'auth.ts was read 9 times. Ask Claude to keep a summary, or point at exact lines.', estSavingUsd: 0.4 });
    expect(reReads(makeAgg({ fileReads: { '/repo/src/auth.ts': 4 } }), NO_OVERHEAD)).toBeNull();
  });

  it('long-context', () => {
    const tip = longContext(makeAgg({ turns: 20, longCtxTurns: 8, longCtxSavingUsd: 1 }), NO_OVERHEAD);
    expect(tip).toMatchObject({ ruleId: 'long-context', message: '40% of turns ran above 150k context. Run /compact earlier.', estSavingUsd: 1 });
    expect(longContext(makeAgg({ turns: 20, longCtxTurns: 5 }), NO_OVERHEAD)).toBeNull();
  });
});

describe('runTips', () => {
  it('keeps the three biggest savings, scaled to at most 60% of the session cost', () => {
    const a = makeAgg({
      durationMin: 180,
      medianContext: 120_000,
      longSessionSavingUsd: 4,
      cacheMisses: 3,
      cacheMissTokens: 300_000,
      cacheMissSavingUsd: 3,
      bigBashOutputs: 3,
      bigBashTokens: 40_000,
      residencyUsd: { bigbash: 2.5 },
      subagentCostUsd: 4,
    });
    const tips = runTips(a, NO_OVERHEAD);
    expect(tips.map((t) => t.ruleId)).toEqual(['long-session', 'cache-miss', 'noisy-bash']);
    expect(tips[0]!.estSavingUsd).toBe(2.35);
    expect(tips[0]!.severity).toBe('high');
    expect(tips.reduce((s, t) => s + t.estSavingUsd, 0)).toBeLessThanOrEqual(6);
  });

  it('drops tips worth less than ten cents', () => {
    expect(runTips(makeAgg({ bigBashOutputs: 3, bigBashTokens: 40_000, residencyUsd: { bigbash: 0.1 } }), NO_OVERHEAD)).toEqual([]);
  });
});

describe('severityFor', () => {
  it('grades by share of session cost', () => {
    expect([severityFor(1.5, 10), severityFor(0.6, 10), severityFor(0.2, 10)]).toEqual(['high', 'warn', 'info']);
  });
});

describe('assessSession', () => {
  it('scores from all avoidable cost and keeps the top three tips', () => {
    const a = makeAgg({ costUsd: 10, durationMin: 180, medianContext: 120_000, longSessionSavingUsd: 4 });
    expect(assessSession(a, NO_OVERHEAD)).toMatchObject({ score: 60, grade: 'C', tips: [{ ruleId: 'long-session' }] });
  });

  it('never drops below the 60% cap', () => {
    const a = makeAgg({ costUsd: 10, durationMin: 180, medianContext: 120_000, longSessionSavingUsd: 40 });
    expect(assessSession(a, NO_OVERHEAD)).toMatchObject({ score: 40, grade: 'D' });
  });

  it('gives tiny sessions a clean grade', () => {
    expect(assessSession(makeAgg({ costUsd: 0.05 }), NO_OVERHEAD)).toMatchObject({ score: 100, grade: 'A' });
  });
});
