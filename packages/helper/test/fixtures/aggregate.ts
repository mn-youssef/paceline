import { TOOL_CATEGORIES, type ToolCategory } from '@paceline/shared';
import type { ProjectOverhead } from '../../src/analysis/overhead';
import type { SessionAggregate } from '../../src/analysis/summary';

export const NO_OVERHEAD: ProjectOverhead = { claudeMd: [], claudeMdTokens: 0, mcpServers: [] };

export function makeAgg(over: Partial<SessionAggregate> = {}): SessionAggregate {
  return {
    sessionId: 's1',
    projectPath: '/repo',
    entrypoint: 'cli',
    startedAt: 0,
    endedAt: 0,
    durationMin: 30,
    activeMin: 30,
    turns: 20,
    costUsd: 10,
    subagentCostUsd: 0,
    costByModel: { 'claude-opus-5-5': 10 },
    hourly: {},
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
    peakContext: 30_000,
    medianContext: 30_000,
    firstTurnContext: 20_000,
    compactions: 0,
    mainModel: 'claude-opus-5-5',
    has1h: false,
    tools: Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, { calls: 0, outputTokens: 0 }])) as SessionAggregate['tools'],
    mcp: {},
    skills: {},
    residencyUsd: {},
    fileReads: {},
    largestRead: null,
    bigBashOutputs: 0,
    bigBashTokens: 0,
    longSessionSavingUsd: 0,
    longCtxTurns: 0,
    longCtxSavingUsd: 0,
    cacheMisses: 0,
    cacheMissTokens: 0,
    cacheMissSavingUsd: 0,
    opusCostUsd: 0,
    opusTurns: 0,
    opusSmallTurns: 0,
    opusSmallSavingUsd: 0,
    pricingEstimated: false,
    ...over,
  };
}

/** Tool table with the given output tokens per category (one call each). */
export function toolsWith(o: Partial<Record<ToolCategory, number>>): SessionAggregate['tools'] {
  const t = makeAgg().tools;
  for (const [c, n] of Object.entries(o)) t[c as ToolCategory] = { calls: 1, outputTokens: n };
  return t;
}
