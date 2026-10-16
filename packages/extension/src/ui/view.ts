import type { Contributor, HiddenCosts, SessionSummary, ToolCategory } from '@paceline/shared';
import type { Conn } from '../core/badge';
import type { Forecast } from '../core/forecast';
import { formatBudgetPct, type HabitSummary } from '../core/habits';
import { formatAgo, formatClock, formatTokens, formatUsd, type FmtOpts } from '../core/format';
import type { ResolvedLimits } from '../core/limits';

export type Family = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other';

export function familyOf(model: string): Family {
  const m = model.toLowerCase();
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

export function modelMix(models: Record<string, number>): { family: Family; share: number }[] {
  const byFamily = new Map<Family, number>();
  let total = 0;
  for (const [model, cost] of Object.entries(models)) {
    const family = familyOf(model);
    byFamily.set(family, (byFamily.get(family) ?? 0) + cost);
    total += cost;
  }
  if (total <= 0) return [];
  return [...byFamily]
    .map(([family, cost]) => ({ family, share: cost / total }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
}

const words = (key: string) => key.replace(/([A-Z])/g, ' $1').toLowerCase();
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function evidenceText(evidence: Record<string, number | string>): string {
  return Object.entries(evidence)
    .map(([key, v]) => {
      const value = typeof v === 'number' ? (Math.abs(v) >= 1_000 ? formatTokens(v) : String(v)) : /[\\/]/.test(v) ? fileName(v) : v;
      return `${words(key)} ${value}`;
    })
    .join(' · ');
}

export function topCategories(tools: SessionSummary['tools'], n = 4): string {
  return (Object.entries(tools) as [ToolCategory, { outputTokens: number }][])
    .filter(([, t]) => t.outputTokens > 0)
    .sort((a, b) => b[1].outputTokens - a[1].outputTokens)
    .slice(0, n)
    .map(([category, t]) => `${category} ${formatTokens(t.outputTokens)}`)
    .join(' · ');
}

const CONN_LABELS: Record<Conn, string> = {
  ok: 'Connected',
  unreachable: 'Helper not found',
  mismatch: 'Helper needs an update',
  error: 'Helper error',
};

export const connLabel = (c: Conn): string => CONN_LABELS[c];

export function sourceLabel(l: ResolvedLimits, now: number): string {
  switch (l.source) {
    case 'claude-code':
      return 'live from Claude Code';
    case 'claude-ai':
      return 'from claude.ai (unofficial)';
    case 'stale':
      return l.updatedAt !== null ? `updated ${formatAgo(now - l.updatedAt)}` : 'stale';
    default:
      return 'waiting for data';
  }
}

/** Why the limit % may be missing or old. Only the terminal CLI runs Claude Code's status line. */
export function limitsHint(conn: Conn, l: ResolvedLimits): string | null {
  if (conn !== 'ok') return null;
  if (l.source === 'none') return 'No limit reading yet. Send a message in Claude Code in your terminal, or turn on the claude.ai fallback in Options.';
  if (l.source === 'stale') return 'Limits refresh when Claude Code runs in a terminal. Using the desktop app or an IDE? Turn on the claude.ai fallback in Options.';
  return null;
}

export type Tone = 'ok' | 'warn' | 'high' | 'muted';

export function forecastLine(f: Forecast | null, now: number, fmt?: FmtOpts): { text: string; tone: Tone } | null {
  if (!f) return null;
  switch (f.status) {
    case 'limited':
      return { text: 'limit reached', tone: 'high' };
    case 'learning':
      return { text: 'learning your pace…', tone: 'muted' };
    case 'steady':
      return { text: 'steady', tone: 'ok' };
    case 'after-reset':
      return { text: 'on pace ✓', tone: 'ok' };
    case 'before-reset':
      return { text: `full ≈ ${f.etaAt !== null ? formatClock(f.etaAt, now, fmt) : '?'} ⚠`, tone: 'high' };
  }
}

export function paceLabel(f: Forecast | null): string | null {
  if (!f || (f.status !== 'before-reset' && f.status !== 'after-reset')) return null;
  return `${f.paceRatio.toFixed(1)}× safe pace`;
}

export interface HiddenCard {
  id: 'cacheMisses' | 'setupOverhead' | 'subagents' | 'longContext';
  title: string;
  usd: number;
  /** True when `usd` is total spend rather than an estimate of avoidable cost. */
  spend: boolean;
  sentence: string;
  action: string;
  who: string[];
}

const who = (list: Contributor[]) => list.map((c) => `${c.projectName} ${formatUsd(c.usd)}`);
const percent = (share: number) => Math.round(share * 100);
// Share of subagent spend that narrower tasks could save (same estimate as the subagent-heavy tip).
const SUBAGENT_SAVING_SHARE = 0.3;
const CLAUDE_MD_WORTH_NAMING = 1_000;

function setupCopy(hc: HiddenCosts): { sentence: string; action: string } {
  const top = hc.setupOverhead.projects[0];
  if (!top) return { sentence: 'Setup is light in every project.', action: 'Nothing to change.' };
  const claudeMd = top.claudeMdTokens >= CLAUDE_MD_WORTH_NAMING;
  const parts = [top.mcpServers > 0 ? `${top.mcpServers} MCP servers` : null, claudeMd ? `CLAUDE.md ${formatTokens(top.claudeMdTokens)}` : null].filter(Boolean);
  const head = `${top.projectName} starts every message with ${formatTokens(top.setupTokens)} tokens`;
  // MCP servers from plugins and connectors are not in the config files we read; without a named
  // cause, point at what usually fills the setup instead of advising to disable servers.
  const sentence = parts.length > 0 ? `${head}: ${parts.join(', ')}.` : `${head} of built-in tools, plugins and skills.`;
  const action =
    top.mcpServers > 0
      ? 'Disable MCP servers you do not use and trim CLAUDE.md.'
      : claudeMd
        ? 'Trim CLAUDE.md to what every task needs.'
        : "Turn off plugins and skills you don't use in this project.";
  return { sentence, action };
}

export function hiddenCards(hc: HiddenCosts): HiddenCard[] {
  const cards: HiddenCard[] = [
    {
      id: 'cacheMisses',
      title: 'Cache misses',
      usd: hc.cacheMisses.usd,
      spend: false,
      sentence:
        hc.cacheMisses.count === 0
          ? 'No restarts after long pauses.'
          : `You paused ${hc.cacheMisses.count} time${hc.cacheMisses.count === 1 ? '' : 's'}; restarts re-sent ${formatTokens(hc.cacheMisses.tokens)} tokens.`,
      action: '/clear before long breaks.',
      who: who(hc.cacheMisses.sessions),
    },
    {
      id: 'setupOverhead',
      title: 'Setup overhead',
      usd: hc.setupOverhead.usd,
      spend: false,
      ...setupCopy(hc),
      who: hc.setupOverhead.projects.map((p) => `${p.projectName} ${formatUsd(p.usd)}`),
    },
    {
      id: 'subagents',
      title: 'Subagents',
      usd: hc.subagents.usd,
      spend: true,
      sentence: `Subagents used ${percent(hc.subagents.share)}% of this window.`,
      action: 'Give subagents narrow tasks and ask for short reports.',
      who: who(hc.subagents.sessions),
    },
    {
      id: 'longContext',
      title: 'Long context',
      usd: hc.longContext.usd,
      spend: false,
      sentence: `${percent(hc.longContext.share)}% of turns ran above 150k context.`,
      action: 'Run /compact earlier.',
      who: who(hc.longContext.sessions),
    },
  ];
  const likelySaving = (c: HiddenCard) => (c.spend ? c.usd * SUBAGENT_SAVING_SHARE : c.usd);
  return cards.sort((a, b) => likelySaving(b) - likelySaving(a));
}

export function habitLine(h: HabitSummary): { today: string; over: boolean; streak: string | null } {
  return {
    today: `Today: ${formatBudgetPct(h.todayPct, h.budgetPct)} of ${h.budgetPct}%`,
    over: h.over,
    streak: h.streak > 0 ? `🔥 ${h.streak}-day streak` : null,
  };
}
