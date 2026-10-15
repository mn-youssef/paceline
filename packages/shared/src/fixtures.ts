import {
  TOOL_CATEGORIES,
  type DashboardData,
  type DashboardSession,
  type HiddenCosts,
  type SessionSummary,
  type SnapshotData,
  type Tip,
  type ToolCategory,
  type ToolStat,
} from './protocol';

export function emptyTools(): Record<ToolCategory, ToolStat> {
  return Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, { calls: 0, outputTokens: 0, residencyUsd: 0 }])) as Record<ToolCategory, ToolStat>;
}

export function makeTip(over: Partial<Tip> = {}): Tip {
  return {
    ruleId: 'long-session',
    severity: 'warn',
    title: 'Long session without /clear',
    message: 'This session ran 3h without /clear. Long context (120k tokens) gets re-sent on every message.',
    evidence: { hours: 3, medianContext: 120_000, turns: 180 },
    estSavingUsd: 1.25,
    ...over,
  };
}

export function makeSummary(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 's1',
    projectPath: '/Users/dev/my-app',
    projectName: 'my-app',
    entrypoint: 'cli',
    startedAt: 0,
    endedAt: 3_600_000,
    durationMin: 60,
    activeMin: 45,
    turns: 40,
    costUsd: 4.2,
    windowCostUsd: 4.2,
    subagentCostUsd: 0,
    models: { 'claude-opus-5-5': 4.2 },
    tokens: { input: 1_000, output: 20_000, cacheRead: 2_000_000, cacheWrite: 300_000 },
    peakContext: 120_000,
    medianContext: 90_000,
    compactions: 0,
    tools: emptyTools(),
    mcpServers: {},
    tips: [],
    pricingEstimated: false,
    ...over,
  };
}

export function makeSnapshot(over: Partial<SnapshotData> = {}): SnapshotData {
  return {
    live: { lastSeenAt: null, capture: null },
    topSessions: [],
    totals: {
      costUsd: 0,
      sessions: 0,
      byModel: {},
      byCategory: Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>,
    },
    indexing: false,
    truncated: false,
    ...over,
  };
}

export function makeHiddenCosts(over: Partial<HiddenCosts> = {}): HiddenCosts {
  return {
    cacheMisses: { count: 9, tokens: 1_100_000, usd: 4.2, sessions: [{ sessionId: 's1', projectName: 'my-app', usd: 3.1 }] },
    setupOverhead: {
      usd: 2.6,
      projects: [{ projectName: 'my-app', projectPath: '/Users/dev/my-app', setupTokens: 78_000, mcpServers: 14, claudeMdTokens: 6_000, usd: 2.6 }],
    },
    subagents: { usd: 6.8, share: 0.34, sessions: [{ sessionId: 's1', projectName: 'my-app', usd: 6.8 }] },
    longContext: { turns: 41, share: 0.41, usd: 5.5, sessions: [{ sessionId: 's1', projectName: 'my-app', usd: 5.5 }] },
    ...over,
  };
}

export function makeDashboard(over: Partial<DashboardData> = {}): DashboardData {
  return {
    range: '7d',
    days: [],
    byModel: {},
    byCategory: Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>,
    heatmap: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
    monthToDateUsd: 0,
    sessions: [],
    truncated: false,
    indexing: false,
    ...over,
  };
}

export function makeDashboardSession(over: Partial<DashboardSession> = {}): DashboardSession {
  return {
    sessionId: 's1',
    projectName: 'my-app',
    startedAt: Date.UTC(2026, 9, 12, 9),
    endedAt: Date.UTC(2026, 9, 12, 10),
    durationMin: 60,
    turns: 12,
    costUsd: 2,
    score: 80,
    grade: 'B',
    tips: [],
    ...over,
  };
}
