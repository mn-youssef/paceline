import { basename } from 'node:path';
import { TOOL_CATEGORIES, type Grade, type SessionSummary, type Tip, type ToolCategory, type ToolStat, type Totals, type Usage } from '@paceline/shared';
import { HOUR_MS, emptyHour, finalize, type AccState, type Counter, type HourStats } from '../parse/accumulator';


export interface SessionAggregate {
  sessionId: string;
  projectPath: string;
  entrypoint: string | null;
  startedAt: number;
  endedAt: number;
  durationMin: number;
  activeMin: number;
  turns: number;
  costUsd: number;
  subagentCostUsd: number;
  costByModel: Record<string, number>;
  hourly: Record<string, HourStats>;
  tokens: Usage;
  peakContext: number;
  medianContext: number;
  firstTurnContext: number;
  compactions: number;
  mainModel: string | null;
  has1h: boolean;
  tools: Record<ToolCategory, Counter>;
  mcp: Record<string, Counter>;
  residencyUsd: Record<string, number>;
  fileReads: Record<string, number>;
  largestRead: { path: string; tokens: number } | null;
  bigBashOutputs: number;
  bigBashTokens: number;
  longSessionSavingUsd: number;
  longCtxTurns: number;
  longCtxSavingUsd: number;
  cacheMisses: number;
  cacheMissTokens: number;
  cacheMissSavingUsd: number;
  opusCostUsd: number;
  opusTurns: number;
  opusSmallTurns: number;
  opusSmallSavingUsd: number;
  pricingEstimated: boolean;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Sum of every hour bucket that overlaps [windowStart, now]. */
export function windowSums(hourly: Record<string, HourStats>, windowStart: number): HourStats {
  const total = emptyHour();
  for (const [key, h] of Object.entries(hourly)) {
    if ((Number(key) + 1) * HOUR_MS <= windowStart) continue;
    for (const f of Object.keys(total) as (keyof HourStats)[]) total[f] += h[f];
  }
  return total;
}

export function windowCost(hourly: Record<string, HourStats>, windowStart: number): number {
  return windowSums(hourly, windowStart).costUsd;
}

function mergeHours(target: Record<string, HourStats>, src: Record<string, HourStats>): void {
  for (const [key, h] of Object.entries(src)) {
    const t = (target[key] ??= emptyHour());
    for (const f of Object.keys(t) as (keyof HourStats)[]) t[f] += h[f];
  }
}

const addInto = (target: Record<string, number>, src: Record<string, number>) => {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v;
};

function dominantModel(costByModel: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCost = -1;
  for (const [model, cost] of Object.entries(costByModel)) {
    if (cost > bestCost) {
      best = model;
      bestCost = cost;
    }
  }
  return best;
}

export function aggregateSessions(states: AccState[]): SessionAggregate[] {
  const groups = new Map<string, AccState[]>();
  for (const s of states) groups.set(s.sessionId, [...(groups.get(s.sessionId) ?? []), finalize(s)]);
  const out: SessionAggregate[] = [];
  for (const [sessionId, group] of groups) {
    if (group.every((s) => s.costUsd === 0)) continue;
    const main = group.find((s) => !s.isSubagentFile) ?? group[0]!;
    const a: SessionAggregate = {
      sessionId,
      projectPath: main.cwd ?? group.find((s) => s.cwd !== null)?.cwd ?? '(unknown project)',
      entrypoint: main.entrypoint,
      startedAt: group.reduce((m, s) => Math.min(m, s.firstTs ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY),
      endedAt: group.reduce((m, s) => Math.max(m, s.lastTs ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY),
      durationMin: main.firstTs !== null && main.lastTs !== null ? (main.lastTs - main.firstTs) / 60_000 : 0,
      activeMin: main.activeMs / 60_000,
      turns: main.turns,
      costUsd: 0,
      subagentCostUsd: 0,
      costByModel: {},
      hourly: {},
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
      peakContext: main.contexts.reduce((m, c) => Math.max(m, c), 0),
      medianContext: median(main.contexts),
      firstTurnContext: main.firstTurnContext ?? 0,
      compactions: main.compactions,
      mainModel: dominantModel(main.costByModel),
      has1h: main.has1h,
      tools: Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, { calls: 0, outputTokens: 0 }])) as Record<ToolCategory, Counter>,
      mcp: {},
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
    };
    for (const s of group) mergeInto(a, s);
    out.push(a);
  }
  return out;
}

function mergeInto(a: SessionAggregate, s: AccState): void {
  a.costUsd += s.costUsd;
  a.subagentCostUsd += s.subagentCostUsd;
  addInto(a.costByModel, s.costByModel);
  mergeHours(a.hourly, s.hourly);
  for (const k of Object.keys(a.tokens) as (keyof Usage)[]) a.tokens[k] += s.tokens[k];
  for (const c of TOOL_CATEGORIES) {
    a.tools[c].calls += s.toolStats[c].calls;
    a.tools[c].outputTokens += s.toolStats[c].outputTokens;
  }
  for (const [server, st] of Object.entries(s.mcpStats)) {
    const t = (a.mcp[server] ??= { calls: 0, outputTokens: 0 });
    t.calls += st.calls;
    t.outputTokens += st.outputTokens;
  }
  addInto(a.residencyUsd, s.residencyUsd);
  addInto(a.fileReads, s.fileReads);
  if (s.largestRead && (!a.largestRead || s.largestRead.tokens > a.largestRead.tokens)) a.largestRead = s.largestRead;
  a.bigBashOutputs += s.bigBashOutputs;
  a.bigBashTokens += s.bigBashTokens;
  a.longSessionSavingUsd += s.longSessionSavingUsd;
  // The long-context share is measured against main-thread turns, so only main turns count here.
  if (!s.isSubagentFile) a.longCtxTurns += s.longCtxTurns;
  a.longCtxSavingUsd += s.longCtxSavingUsd;
  a.cacheMisses += s.cacheMisses;
  a.cacheMissTokens += s.cacheMissTokens;
  a.cacheMissSavingUsd += s.cacheMissSavingUsd;
  a.opusCostUsd += s.opusCostUsd;
  a.opusTurns += s.opusTurns;
  a.opusSmallTurns += s.opusSmallTurns;
  a.opusSmallSavingUsd += s.opusSmallSavingUsd;
  a.pricingEstimated ||= s.pricingEstimated;
}

export function toSummary(a: SessionAggregate, windowStart: number, tips: Tip[], quality?: { score: number; grade: Grade }): SessionSummary {
  const tools = Object.fromEntries(
    TOOL_CATEGORIES.map((c) => [c, { ...a.tools[c], residencyUsd: a.residencyUsd[`cat:${c}`] ?? 0 }]),
  ) as Record<ToolCategory, ToolStat>;
  const mcpServers: Record<string, ToolStat> = {};
  for (const [server, st] of Object.entries(a.mcp)) mcpServers[server] = { ...st, residencyUsd: a.residencyUsd[`mcp:${server}`] ?? 0 };
  return {
    sessionId: a.sessionId,
    projectPath: a.projectPath,
    projectName: basename(a.projectPath) || a.projectPath,
    entrypoint: a.entrypoint,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    durationMin: a.durationMin,
    activeMin: a.activeMin,
    turns: a.turns,
    costUsd: a.costUsd,
    windowCostUsd: windowCost(a.hourly, windowStart),
    subagentCostUsd: a.subagentCostUsd,
    models: a.costByModel,
    tokens: { input: a.tokens.input, output: a.tokens.output, cacheRead: a.tokens.cacheRead, cacheWrite: a.tokens.cacheWrite5m + a.tokens.cacheWrite1h },
    peakContext: a.peakContext,
    medianContext: a.medianContext,
    compactions: a.compactions,
    tools,
    mcpServers,
    tips,
    pricingEstimated: a.pricingEstimated,
    ...quality,
  };
}

/** Window totals. Per-model cost is the session's model split scaled to its in-window share. */
export function computeTotals(aggs: SessionAggregate[], windowStart: number): Totals {
  const byModel: Record<string, number> = {};
  const byCategory = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>;
  let costUsd = 0;
  for (const a of aggs) {
    const inWindow = windowCost(a.hourly, windowStart);
    costUsd += inWindow;
    const share = a.costUsd > 0 ? inWindow / a.costUsd : 0;
    for (const [model, cost] of Object.entries(a.costByModel)) byModel[model] = (byModel[model] ?? 0) + cost * share;
    for (const c of TOOL_CATEGORIES) byCategory[c] += a.tools[c].outputTokens;
  }
  return { costUsd, sessions: aggs.length, byModel, byCategory };
}
