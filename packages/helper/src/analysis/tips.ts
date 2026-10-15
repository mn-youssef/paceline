import { basename } from 'node:path';
import { GRADE_MIN_COST_USD, gradeFor, priceFor, type Grade, type Tip, type TipSeverity } from '@paceline/shared';
import { hours, k, pct, round1, round2 } from './format';
import type { ProjectOverhead } from './overhead';
import type { SessionAggregate } from './summary';

export const MIN_SAVING_USD = 0.1;
export const MAX_WASTE_SHARE = 0.6;
export const MAX_TIPS = 3;

type Draft = Omit<Tip, 'severity'>;
export type Rule = (a: SessionAggregate, o: ProjectOverhead) => Draft | null;

const toolTokens = (a: SessionAggregate): number => Object.values(a.tools).reduce((s, t) => s + t.outputTokens, 0);

export const longSession: Rule = (a) => {
  if (a.durationMin < 120 || a.medianContext < 80_000 || a.compactions > 0) return null;
  return {
    ruleId: 'long-session',
    title: 'Long session without /clear',
    message: `This session ran ${hours(a.durationMin)}h without /clear. Long context (${k(a.medianContext)} tokens) gets re-sent on every message.`,
    evidence: { hours: round1(a.durationMin / 60), medianContext: a.medianContext, turns: a.turns },
    estSavingUsd: a.longSessionSavingUsd,
  };
};

export const bigReads: Rule = (a) => {
  const total = toolTokens(a);
  const read = a.tools.read.outputTokens;
  if (total === 0 || read < 20_000 || read / total < 0.4) return null;
  const largest = a.largestRead ? ` (largest: ${basename(a.largestRead.path)} at ${k(a.largestRead.tokens)})` : '';
  return {
    ruleId: 'big-reads',
    title: 'Large file reads',
    message: `${pct(read / total)}% of tool tokens were file reads${largest}. Point Claude to specific files or line ranges.`,
    evidence: {
      readShare: pct(read / total),
      readTokens: read,
      ...(a.largestRead ? { largestFile: a.largestRead.path, largestTokens: a.largestRead.tokens } : {}),
    },
    estSavingUsd: 0.5 * (a.residencyUsd['cat:read'] ?? 0),
  };
};

export const opusRoutine: Rule = (a) => {
  if (a.costUsd === 0 || a.opusTurns < 10) return null;
  const share = a.opusCostUsd / a.costUsd;
  const small = a.opusSmallTurns / a.opusTurns;
  if (share < 0.7 || small < 0.6) return null;
  return {
    ruleId: 'opus-routine',
    title: 'Opus on routine edits',
    message: `Opus used ${pct(share)}% of this session, and ${pct(small)}% of its turns were small edits. Use Sonnet for routine edits (/model sonnet).`,
    evidence: { opusShare: pct(share), smallTurnShare: pct(small), opusTurns: a.opusTurns },
    estSavingUsd: a.opusSmallSavingUsd,
  };
};

export const mcpHeavy: Rule = (a) => {
  const total = toolTokens(a);
  const top = Object.entries(a.mcp).sort((x, y) => y[1].outputTokens - x[1].outputTokens)[0];
  if (total === 0 || !top || top[1].outputTokens / total < 0.2) return null;
  const [server, stat] = top;
  return {
    ruleId: 'mcp-heavy',
    title: 'Heavy MCP tool output',
    message: `The ${server} MCP server returned ${k(stat.outputTokens)} tokens. Disable servers you don't need in this project.`,
    evidence: { server, outputTokens: stat.outputTokens, calls: stat.calls, share: pct(stat.outputTokens / total) },
    estSavingUsd: 0.5 * (a.residencyUsd[`mcp:${server}`] ?? 0),
  };
};

export const cacheMiss: Rule = (a) => {
  if (a.cacheMisses < 3) return null;
  const ttl = a.has1h ? 60 : 5;
  return {
    ruleId: 'cache-miss',
    title: 'Cache expired during pauses',
    message: `You paused ${a.cacheMisses} times; each restart re-sent ~${k(a.cacheMissTokens / a.cacheMisses)} tokens. /clear before long breaks, or keep pauses under ${ttl} min.`,
    evidence: { pauses: a.cacheMisses, tokensResent: a.cacheMissTokens, cacheTtlMin: ttl },
    estSavingUsd: a.cacheMissSavingUsd,
  };
};

export const highOverhead: Rule = (a, o) => {
  if (a.firstTurnContext < 40_000) return null;
  const parts: string[] = [];
  if (o.mcpServers.length > 0) parts.push(`${o.mcpServers.length} MCP server${o.mcpServers.length === 1 ? '' : 's'}`);
  if (o.claudeMdTokens > 0) parts.push(`CLAUDE.md ${k(o.claudeMdTokens)}`);
  if (parts.length === 0) parts.push('system prompt, tools and skills');
  const pRead = priceFor(a.mainModel ?? 'claude-sonnet-5-5').price.cacheRead / 1e6;
  return {
    ruleId: 'high-overhead',
    title: 'Heavy setup on every message',
    message: `Every message here starts with ${k(a.firstTurnContext)} tokens of setup: ${parts.join(', ')}.`,
    evidence: { setupTokens: a.firstTurnContext, mcpServers: o.mcpServers.length, claudeMdTokens: o.claudeMdTokens },
    estSavingUsd: (a.firstTurnContext - 20_000) * pRead * a.turns,
  };
};

export const subagentHeavy: Rule = (a) => {
  if (a.costUsd === 0) return null;
  const share = a.subagentCostUsd / a.costUsd;
  if (share < 0.4) return null;
  return {
    ruleId: 'subagent-heavy',
    title: 'Subagents dominate',
    message: `Subagents used ${pct(share)}% of this session. Give them narrower tasks and ask for shorter reports.`,
    evidence: { subagentShare: pct(share), subagentCostUsd: round2(a.subagentCostUsd) },
    estSavingUsd: 0.3 * a.subagentCostUsd,
  };
};

export const noisyBash: Rule = (a) => {
  if (a.bigBashOutputs < 3) return null;
  return {
    ruleId: 'noisy-bash',
    title: 'Noisy command output',
    message: `${a.bigBashOutputs} commands dumped ${k(a.bigBashTokens)} tokens of output. Pipe long logs through tail or grep.`,
    evidence: { commands: a.bigBashOutputs, outputTokens: a.bigBashTokens },
    estSavingUsd: 0.8 * (a.residencyUsd.bigbash ?? 0),
  };
};

export const reReads: Rule = (a) => {
  const top = Object.entries(a.fileReads).sort((x, y) => y[1] - x[1])[0];
  if (!top || top[1] < 5) return null;
  return {
    ruleId: 're-reads',
    title: 'Same file read repeatedly',
    message: `${basename(top[0])} was read ${top[1]} times. Ask Claude to keep a summary, or point at exact lines.`,
    evidence: { file: top[0], reads: top[1] },
    estSavingUsd: a.residencyUsd.reread ?? 0,
  };
};

export const longContext: Rule = (a) => {
  if (a.turns < 10) return null;
  const share = a.longCtxTurns / a.turns;
  if (share < 0.3) return null;
  return {
    ruleId: 'long-context',
    title: 'Running at very long context',
    message: `${pct(share)}% of turns ran above 150k context. Run /compact earlier.`,
    evidence: { share: pct(share), turns: a.longCtxTurns },
    estSavingUsd: a.longCtxSavingUsd,
  };
};

export const RULES: Rule[] = [longSession, bigReads, opusRoutine, mcpHeavy, cacheMiss, highOverhead, subagentHeavy, noisyBash, reReads, longContext];

export function severityFor(saving: number, cost: number): TipSeverity {
  const share = cost > 0 ? saving / cost : 0;
  if (share >= 0.15) return 'high';
  if (share >= 0.05) return 'warn';
  return 'info';
}

/** Every tip that fires, savings scaled so their sum stays within 60% of the session cost. Unrounded, largest first. */
export function scaledTips(a: SessionAggregate, o: ProjectOverhead, rules: Rule[] = RULES): Tip[] {
  const drafts = rules.map((rule) => rule(a, o)).filter((d): d is Draft => d !== null && d.estSavingUsd >= MIN_SAVING_USD);
  const total = drafts.reduce((s, d) => s + d.estSavingUsd, 0);
  const cap = MAX_WASTE_SHARE * a.costUsd;
  const scale = total > cap && total > 0 ? cap / total : 1;
  return drafts
    .map((d) => {
      const saving = d.estSavingUsd * scale;
      return { ...d, estSavingUsd: saving, severity: severityFor(saving, a.costUsd) };
    })
    .sort((x, y) => y.estSavingUsd - x.estSavingUsd);
}

export function runTips(a: SessionAggregate, o: ProjectOverhead, rules: Rule[] = RULES): Tip[] {
  return scaledTips(a, o, rules)
    .slice(0, MAX_TIPS)
    .map((t) => ({ ...t, estSavingUsd: round2(t.estSavingUsd) }));
}

/** The tips to show, and a 0–100 efficiency score from all avoidable cost (spec §6.2). */
export function assessSession(a: SessionAggregate, o: ProjectOverhead, rules: Rule[] = RULES): { tips: Tip[]; score: number; grade: Grade } {
  const all = scaledTips(a, o, rules);
  const avoidable = all.reduce((s, t) => s + t.estSavingUsd, 0);
  const score = a.costUsd < GRADE_MIN_COST_USD ? 100 : Math.round(100 * (1 - avoidable / a.costUsd));
  return {
    tips: all.slice(0, MAX_TIPS).map((t) => ({ ...t, estSavingUsd: round2(t.estSavingUsd) })),
    score,
    grade: gradeFor(score),
  };
}
