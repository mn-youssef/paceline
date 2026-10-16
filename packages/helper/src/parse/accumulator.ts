import { PRICES, TOOL_CATEGORIES, costUsd, priceFor, type ModelPrice, type ToolCategory, type Usage } from '@paceline/shared';
import type { AssistantEvent, LogEvent, ToolCall, UserEvent } from './line';
import { ROUTINE_TOOLS, categorize, mcpServer } from './tools';

// Bump whenever counting changes, so cached per-file states are rebuilt.
export const ACC_VERSION = 4;
const MIN = 60_000;
export const ACTIVE_GAP_MS = 5 * MIN;
export const LONG_SESSION_CONTEXT = 80_000;
export const LONG_SESSION_BASELINE = 40_000;
export const LONG_CONTEXT = 150_000;
export const LONG_CONTEXT_BASELINE = 100_000;
export const CACHE_MISS_MIN_WRITE = 50_000;
export const BIG_BASH_OUTPUT = 10_000;
export const SMALL_TURN_OUTPUT = 1_500;

export interface Counter {
  calls: number;
  outputTokens: number;
}

/** Spend and waste signals for one clock hour, so any time window can be summed. */
export interface HourStats {
  costUsd: number;
  subagentCostUsd: number;
  turns: number;
  longCtxTurns: number;
  longCtxSavingUsd: number;
  cacheMisses: number;
  cacheMissTokens: number;
  cacheMissSavingUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 5-minute and 1-hour cache writes together. */
  cacheWriteTokens: number;
}

export const HOUR_MS = 3_600_000;

export const emptyHour = (): HourStats => ({
  costUsd: 0,
  subagentCostUsd: 0,
  turns: 0,
  longCtxTurns: 0,
  longCtxSavingUsd: 0,
  cacheMisses: 0,
  cacheMissTokens: 0,
  cacheMissSavingUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export interface PendingTurn {
  messageId: string;
  model: string;
  usage: Usage;
  toolNames: string[];
  main: boolean;
}

export interface AccState {
  v: number;
  sessionId: string;
  isSubagentFile: boolean;
  cwd: string | null;
  entrypoint: string | null;
  firstTs: number | null;
  lastTs: number | null;
  lastActivityTs: number | null;
  activeMs: number;
  turns: number;
  tokens: Usage;
  costUsd: number;
  subagentCostUsd: number;
  costByModel: Record<string, number>;
  hourly: Record<string, HourStats>;
  pricingEstimated: boolean;
  contexts: number[];
  firstTurnContext: number | null;
  compactions: number;
  lastModel: string | null;
  has1h: boolean;
  lastTurnTs: number | null;
  resident: Record<string, number>;
  residencyUsd: Record<string, number>;
  toolStats: Record<ToolCategory, Counter>;
  mcpStats: Record<string, Counter>;
  pendingTools: Record<string, { name: string; filePath: string | null }>;
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
  malformed: number;
  pending: PendingTurn | null;
}

export function newAccState(sessionId: string, isSubagentFile: boolean): AccState {
  return {
    v: ACC_VERSION,
    sessionId,
    isSubagentFile,
    cwd: null,
    entrypoint: null,
    firstTs: null,
    lastTs: null,
    lastActivityTs: null,
    activeMs: 0,
    turns: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
    costUsd: 0,
    subagentCostUsd: 0,
    costByModel: {},
    hourly: {},
    pricingEstimated: false,
    contexts: [],
    firstTurnContext: null,
    compactions: 0,
    lastModel: null,
    has1h: false,
    lastTurnTs: null,
    resident: {},
    residencyUsd: {},
    toolStats: Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, { calls: 0, outputTokens: 0 }])) as Record<ToolCategory, Counter>,
    mcpStats: {},
    pendingTools: {},
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
    malformed: 0,
    pending: null,
  };
}

const add = (rec: Record<string, number>, key: string, v: number) => {
  rec[key] = (rec[key] ?? 0) + v;
};

export function applyEvent(s: AccState, ev: LogEvent): void {
  if (ev.kind === 'malformed') {
    s.malformed++;
    return;
  }
  if (s.cwd === null && ev.cwd) s.cwd = ev.cwd;
  if (s.entrypoint === null && ev.entrypoint) s.entrypoint = ev.entrypoint;
  const main = !ev.sidechain || s.isSubagentFile;
  touch(s, ev.ts, main);
  if (ev.kind === 'assistant') onAssistant(s, ev, main);
  else if (ev.kind === 'user') onUser(s, ev, main);
  else if (main) {
    s.compactions++;
    s.resident = {};
  }
}

/** Deep copy with the in-flight turn committed, for reporting. The input is left untouched. */
export function finalize(s: AccState): AccState {
  const copy = structuredClone(s);
  if (copy.pending) {
    commitTurn(copy, copy.pending);
    copy.pending = null;
  }
  return copy;
}

function touch(s: AccState, ts: number | null, main: boolean): void {
  if (ts === null) return;
  if (s.firstTs === null || ts < s.firstTs) s.firstTs = ts;
  if (s.lastTs === null || ts > s.lastTs) s.lastTs = ts;
  if (!main) return;
  if (s.lastActivityTs !== null) {
    const gap = ts - s.lastActivityTs;
    if (gap > 0 && gap < ACTIVE_GAP_MS) s.activeMs += gap;
  }
  if (s.lastActivityTs === null || ts > s.lastActivityTs) s.lastActivityTs = ts;
}

function onAssistant(s: AccState, ev: AssistantEvent, main: boolean): void {
  if (s.pending && s.pending.messageId === ev.messageId) {
    s.pending.toolNames.push(...ev.tools.map((t) => t.name));
    registerTools(s, ev.tools);
    if (ev.usage) addUsageGrowth(s, s.pending, ev.usage, ev.ts);
    return;
  }
  if (s.pending) commitTurn(s, s.pending);
  s.pending = null;
  registerTools(s, ev.tools);
  if (!ev.usage) return;
  s.pending = { messageId: ev.messageId, model: ev.model, usage: ev.usage, toolNames: ev.tools.map((t) => t.name), main };
  countTurn(s, ev.model, ev.usage, ev.ts, main);
}

/** The counters for the clock hour containing ts (created on first use), or null without a timestamp. */
function hourOf(s: AccState, ts: number | null): HourStats | null {
  return ts === null ? null : (s.hourly[String(Math.floor(ts / HOUR_MS))] ??= emptyHour());
}

/** Adds the tokens and their cost to every spend counter. Returns the model's price row. */
function addSpend(s: AccState, model: string, u: Usage, ts: number | null, main: boolean): ModelPrice {
  const { price, estimated } = priceFor(model);
  if (estimated) s.pricingEstimated = true;
  const cost = costUsd(u, price);
  s.costUsd += cost;
  const subagent = !main || s.isSubagentFile;
  if (subagent) s.subagentCostUsd += cost;
  add(s.costByModel, model, cost);
  const hour = hourOf(s, ts);
  if (hour) {
    hour.costUsd += cost;
    if (subagent) hour.subagentCostUsd += cost;
    hour.inputTokens += u.input;
    hour.outputTokens += u.output;
    hour.cacheReadTokens += u.cacheRead;
    hour.cacheWriteTokens += u.cacheWrite5m + u.cacheWrite1h;
  }
  s.tokens.input += u.input;
  s.tokens.output += u.output;
  s.tokens.cacheRead += u.cacheRead;
  s.tokens.cacheWrite5m += u.cacheWrite5m;
  s.tokens.cacheWrite1h += u.cacheWrite1h;
  if (/opus/i.test(model)) s.opusCostUsd += cost;
  return price;
}

const USAGE_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const;

/**
 * Main logs repeat the same usage on every content line of a message, but subagent logs report
 * the running output count, final only on the last line. Count whatever grew since the first line.
 */
function addUsageGrowth(s: AccState, p: PendingTurn, u: Usage, ts: number | null): void {
  const growth = { ...u };
  let grew = false;
  for (const f of USAGE_FIELDS) {
    growth[f] = Math.max(0, u[f] - p.usage[f]);
    if (growth[f] > 0) grew = true;
  }
  if (!grew) return;
  for (const f of USAGE_FIELDS) p.usage[f] = Math.max(p.usage[f], u[f]);
  addSpend(s, p.model, growth, ts, p.main);
}

function countTurn(s: AccState, model: string, u: Usage, ts: number | null, main: boolean): void {
  const price = addSpend(s, model, u, ts, main);
  if (u.cacheWrite1h > 0) s.has1h = true;
  s.lastModel = model;
  if (!main) return;

  const ctx = u.input + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;
  const hour = hourOf(s, ts);
  if (!s.isSubagentFile) {
    s.turns++;
    s.contexts.push(ctx);
    if (s.firstTurnContext === null) s.firstTurnContext = ctx;
    if (hour) hour.turns++;
  }
  const pRead = price.cacheRead / 1e6;
  if (ctx > LONG_SESSION_CONTEXT) s.longSessionSavingUsd += (ctx - LONG_SESSION_BASELINE) * pRead;
  if (ctx > LONG_CONTEXT) {
    const saving = (ctx - LONG_CONTEXT_BASELINE) * pRead;
    s.longCtxTurns++;
    s.longCtxSavingUsd += saving;
    if (hour) {
      if (!s.isSubagentFile) hour.longCtxTurns++;
      hour.longCtxSavingUsd += saving;
    }
  }
  const written = u.cacheWrite5m + u.cacheWrite1h;
  if (ts !== null && s.lastTurnTs !== null) {
    const ttlMs = (s.has1h ? 60 : 5) * MIN;
    if (ts - s.lastTurnTs > ttlMs && written > CACHE_MISS_MIN_WRITE) {
      const pWrite = (s.has1h ? price.cacheWrite1h : price.cacheWrite5m) / 1e6;
      const saving = written * (pWrite - pRead);
      s.cacheMisses++;
      s.cacheMissTokens += written;
      s.cacheMissSavingUsd += saving;
      if (hour) {
        hour.cacheMisses++;
        hour.cacheMissTokens += written;
        hour.cacheMissSavingUsd += saving;
      }
    }
  }
  if (ts !== null) s.lastTurnTs = ts;
  for (const [key, tokens] of Object.entries(s.resident)) add(s.residencyUsd, key, tokens * pRead);
}

function registerTools(s: AccState, tools: ToolCall[]): void {
  for (const t of tools) {
    const cat = categorize(t.name);
    s.toolStats[cat].calls++;
    if (cat === 'mcp') (s.mcpStats[mcpServer(t.name)] ??= { calls: 0, outputTokens: 0 }).calls++;
    s.pendingTools[t.id] = { name: t.name, filePath: t.filePath };
  }
}

function onUser(s: AccState, ev: UserEvent, main: boolean): void {
  for (const r of ev.results) {
    const toolCall = s.pendingTools[r.toolUseId];
    if (!toolCall) continue;
    delete s.pendingTools[r.toolUseId];
    const cat = categorize(toolCall.name);
    s.toolStats[cat].outputTokens += r.tokens;
    const keys = [`cat:${cat}`];
    if (cat === 'mcp') {
      const server = mcpServer(toolCall.name);
      (s.mcpStats[server] ??= { calls: 0, outputTokens: 0 }).outputTokens += r.tokens;
      keys.push(`mcp:${server}`);
    }
    if (cat === 'bash' && r.tokens > BIG_BASH_OUTPUT) {
      s.bigBashOutputs++;
      s.bigBashTokens += r.tokens;
      keys.push('bigbash');
    }
    if (cat === 'read' && toolCall.filePath) {
      const count = (s.fileReads[toolCall.filePath] ?? 0) + 1;
      s.fileReads[toolCall.filePath] = count;
      if (count > 1) keys.push('reread');
      if (!s.largestRead || r.tokens > s.largestRead.tokens) s.largestRead = { path: toolCall.filePath, tokens: r.tokens };
    }
    if (!main) continue;
    const price = priceFor(s.lastModel ?? 'claude-sonnet-5-5').price;
    const pWrite = (s.has1h ? price.cacheWrite1h : price.cacheWrite5m) / 1e6;
    for (const k of keys) {
      add(s.resident, k, r.tokens);
      add(s.residencyUsd, k, r.tokens * pWrite);
    }
  }
}

function commitTurn(s: AccState, t: PendingTurn): void {
  if (!t.main || s.isSubagentFile || !/opus/i.test(t.model)) return;
  s.opusTurns++;
  if (t.usage.output >= SMALL_TURN_OUTPUT || !t.toolNames.every((n) => ROUTINE_TOOLS.has(n))) return;
  s.opusSmallTurns++;
  const opus = costUsd(t.usage, priceFor(t.model).price);
  const sonnet = costUsd(t.usage, PRICES['claude-sonnet-5-5']!);
  s.opusSmallSavingUsd += Math.max(0, opus - sonnet);
}
