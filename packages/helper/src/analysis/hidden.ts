import { basename } from 'node:path';
import { priceFor, type Contributor, type HiddenCosts } from '@paceline/shared';
import type { ProjectOverhead } from './overhead';
import { median, windowSums, type SessionAggregate } from './summary';

const SETUP_BASELINE = 20_000;
const TOP = 3;

const projectName = (path: string) => basename(path) || path;

function top(items: { a: SessionAggregate; usd: number }[]): Contributor[] {
  return items
    .filter((x) => x.usd > 0)
    .sort((x, y) => y.usd - x.usd)
    .slice(0, TOP)
    .map(({ a, usd }) => ({ sessionId: a.sessionId, projectName: projectName(a.projectPath), usd }));
}

/** Waste signals summed over every session active in the window, with the biggest contributors. */
export function computeHiddenCosts(aggs: SessionAggregate[], windowStart: number, overheadFor: (cwd: string) => ProjectOverhead): HiddenCosts {
  const rows = aggs.map((a) => ({ a, w: windowSums(a.hourly, windowStart) }));
  const sum = (pick: (w: (typeof rows)[number]['w']) => number) => rows.reduce((s, r) => s + pick(r.w), 0);
  const cost = sum((w) => w.costUsd);
  const turns = sum((w) => w.turns);
  const subagentUsd = sum((w) => w.subagentCostUsd);
  const longTurns = sum((w) => w.longCtxTurns);

  const byProject = new Map<string, { firsts: number[]; usd: number }>();
  for (const { a, w } of rows) {
    if (a.firstTurnContext <= 0 || w.turns === 0) continue;
    const pRead = priceFor(a.mainModel ?? 'claude-sonnet-5-5').price.cacheRead / 1e6;
    const p = byProject.get(a.projectPath) ?? { firsts: [], usd: 0 };
    p.firsts.push(a.firstTurnContext);
    p.usd += Math.max(0, a.firstTurnContext - SETUP_BASELINE) * pRead * w.turns;
    byProject.set(a.projectPath, p);
  }
  const projects = [...byProject]
    .filter(([, p]) => p.usd > 0)
    .sort((x, y) => y[1].usd - x[1].usd)
    .slice(0, TOP)
    .map(([path, p]) => {
      const o = overheadFor(path);
      return { projectName: projectName(path), projectPath: path, setupTokens: median(p.firsts), mcpServers: o.mcpServers.length, claudeMdTokens: o.claudeMdTokens, usd: p.usd };
    });

  return {
    cacheMisses: {
      count: sum((w) => w.cacheMisses),
      tokens: sum((w) => w.cacheMissTokens),
      usd: sum((w) => w.cacheMissSavingUsd),
      sessions: top(rows.map(({ a, w }) => ({ a, usd: w.cacheMissSavingUsd }))),
    },
    setupOverhead: { usd: [...byProject.values()].reduce((s, p) => s + p.usd, 0), projects },
    subagents: { usd: subagentUsd, share: cost > 0 ? subagentUsd / cost : 0, sessions: top(rows.map(({ a, w }) => ({ a, usd: w.subagentCostUsd }))) },
    longContext: {
      turns: longTurns,
      share: turns > 0 ? longTurns / turns : 0,
      usd: sum((w) => w.longCtxSavingUsd),
      sessions: top(rows.map(({ a, w }) => ({ a, usd: w.longCtxSavingUsd }))),
    },
  };
}
