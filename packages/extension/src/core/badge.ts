import { formatAgo, formatClock, type FmtOpts } from './format';
import type { ResolvedLimits, WindowState } from './limits';
import type { BadgeWindow, Settings } from './settings';

export type Conn = 'ok' | 'unreachable' | 'mismatch' | 'error';

export interface Badge {
  text: string;
  color: string;
  title: string;
}

export const COLORS = { green: '#16a34a', orange: '#ea580c', red: '#dc2626', grey: '#6b7280' } as const;

export function colorFor(pct: number): string {
  if (pct >= 80) return COLORS.red;
  if (pct >= 50) return COLORS.orange;
  return COLORS.green;
}

export function badgePct(l: ResolvedLimits, which: BadgeWindow): number | null {
  const five = l.fiveHour?.pct ?? null;
  const seven = l.sevenDay?.pct ?? null;
  if (which === '5h') return five;
  if (which === '7d') return seven;
  if (five === null) return seven;
  if (seven === null) return five;
  return Math.max(five, seven);
}

export function badgeTitle(l: ResolvedLimits, now: number, fmt: FmtOpts = {}): string {
  const part = (label: string, w: WindowState | null) =>
    w ? `${label} ${Math.round(w.pct)}%${w.resetsAt !== null ? ` · resets ${formatClock(w.resetsAt, now, fmt)}` : ''}` : null;
  const parts = [part('5h', l.fiveHour), part('7d', l.sevenDay)].filter((p): p is string => p !== null);
  let title = `Paceline — ${parts.length > 0 ? parts.join(' | ') : 'no usage data yet'}`;
  if (l.source === 'stale' && l.updatedAt !== null) title += `\nupdated ${formatAgo(now - l.updatedAt)}`;
  if (l.source === 'claude-ai') title += '\nsource: claude.ai (unofficial)';
  return title;
}

export function computeBadge(i: {
  limits: ResolvedLimits;
  conn: Conn;
  settings: Settings;
  celebrateUntil: number | null;
  now: number;
  fmt?: FmtOpts;
}): Badge {
  if (i.conn === 'unreachable' && i.limits.source !== 'claude-ai') {
    return { text: '!', color: COLORS.grey, title: 'Paceline — not connected to Claude Code. Click to set up.' };
  }
  if (i.celebrateUntil !== null && i.now < i.celebrateUntil) {
    return { text: 'NEW', color: COLORS.green, title: 'Paceline — fresh limit! 🎉' };
  }
  const title = badgeTitle(i.limits, i.now, i.fmt);
  const withHint = i.conn === 'mismatch' ? `${title}\nUpdate the helper: npx paceline@latest install` : title;
  const pct = badgePct(i.limits, i.settings.badgeWindow);
  if (pct === null) return { text: '—', color: COLORS.grey, title: withHint };
  const shown = Math.round(pct);
  return {
    text: shown > 99 ? '99+' : String(shown),
    color: i.limits.source === 'stale' ? COLORS.grey : colorFor(shown),
    title: withHint,
  };
}
