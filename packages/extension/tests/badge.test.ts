import { describe, expect, it } from 'vitest';
import { COLORS, computeBadge } from '../src/core/badge';
import { NO_LIMITS, type LimitSource, type ResolvedLimits } from '../src/core/limits';
import { DEFAULT_SETTINGS } from '../src/core/settings';

const FMT = { locale: 'en-GB', timeZone: 'UTC' };
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 13, 12, 0);

const limits = (five: number | null, seven: number | null, source: LimitSource = 'claude-code'): ResolvedLimits => ({
  fiveHour: five === null ? null : { pct: five, resetsAt: Date.UTC(2026, 9, 13, 15, 40) },
  sevenDay: seven === null ? null : { pct: seven, resetsAt: Date.UTC(2026, 9, 19, 9, 0) },
  source,
  updatedAt: NOW - 20 * MIN,
});

const badge = (l: ResolvedLimits, over: Partial<Parameters<typeof computeBadge>[0]> = {}) =>
  computeBadge({ limits: l, conn: 'ok', settings: DEFAULT_SETTINGS, celebrateUntil: null, now: NOW, fmt: FMT, ...over });

describe('computeBadge', () => {
  it('shows the tighter window, coloured by the number it displays', () => {
    expect(badge(limits(42, 18))).toMatchObject({ text: '42', color: COLORS.green });
    expect(badge(limits(20, 50))).toMatchObject({ text: '50', color: COLORS.orange });
    expect(badge(limits(79.4, 1))).toMatchObject({ text: '79', color: COLORS.orange });
    expect(badge(limits(80, 1))).toMatchObject({ text: '80', color: COLORS.red });
    expect(badge(limits(120, 1))).toMatchObject({ text: '99+', color: COLORS.red });
  });

  it('can follow one window only', () => {
    expect(badge(limits(42, 70), { settings: { ...DEFAULT_SETTINGS, badgeWindow: '5h' } }).text).toBe('42');
  });

  it('greys out stale data but keeps the number', () => {
    const b = badge(limits(42, 18, 'stale'));
    expect(b).toMatchObject({ text: '42', color: COLORS.grey });
    expect(b.title).toContain('updated 20 min ago');
  });

  it('shows ! when the helper is missing and nothing else is known', () => {
    expect(badge(NO_LIMITS, { conn: 'unreachable' })).toMatchObject({ text: '!', color: COLORS.grey });
    expect(badge(limits(42, 18, 'claude-ai'), { conn: 'unreachable' }).text).toBe('42');
  });

  it('says NEW for a while after a celebrated reset', () => {
    expect(badge(limits(0, 0), { celebrateUntil: NOW + 1 }).text).toBe('NEW');
  });

  it('shows a dash when no reading exists', () => {
    expect(badge(NO_LIMITS)).toMatchObject({ text: '—', color: COLORS.grey });
  });

  it('writes a readable tooltip', () => {
    expect(badge(limits(42, 18)).title).toBe('Paceline — 5h 42% · resets 15:40 | 7d 18% · resets Mon 09:00');
  });
});
