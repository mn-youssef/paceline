import { describe, expect, it } from 'vitest';
import type { ResolvedLimits } from '../src/core/limits';
import { EMPTY_TRACKER, celebrationText, detectResets, resetAlarms, type ResetTracker } from '../src/core/resets';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const HOUR = 3_600_000;
const L = (pct: number | null, resetsAt: number | null): ResolvedLimits => ({
  fiveHour: pct === null ? null : { pct, resetsAt },
  sevenDay: null,
  source: 'claude-code',
  updatedAt: NOW,
});

describe('detectResets', () => {
  it('celebrates once when a busy window resets', () => {
    const before: ResetTracker = { '5h': { pct: 70, resetsAt: NOW - 1_000 }, '7d': null };
    const first = detectResets(before, L(0, null), NOW, 50);
    expect(first.celebrate).toEqual(['5h']);
    expect(first.next['5h']).toEqual({ pct: 0, resetsAt: null });
    expect(detectResets(first.next, L(0, null), NOW + 60_000, 50).celebrate).toEqual([]);
  });

  it('stays quiet when the window was barely used', () => {
    expect(detectResets({ '5h': { pct: 20, resetsAt: NOW - 1 }, '7d': null }, L(0, null), NOW, 50).celebrate).toEqual([]);
  });

  it('remembers the latest reading before the reset', () => {
    expect(detectResets(EMPTY_TRACKER, L(42, NOW + HOUR), NOW, 50).next['5h']).toEqual({ pct: 42, resetsAt: NOW + HOUR });
  });
});

describe('resetAlarms', () => {
  it('schedules alarms for future resets only', () => {
    const limits: ResolvedLimits = { fiveHour: { pct: 1, resetsAt: NOW + HOUR }, sevenDay: { pct: 1, resetsAt: null }, source: 'claude-code', updatedAt: NOW };
    expect(resetAlarms(limits, NOW)).toEqual([{ name: 'reset:5h', when: NOW + HOUR }]);
  });
});

describe('celebrationText', () => {
  it('mentions the weekly limit when it reset', () => {
    expect(celebrationText(['5h']).title).toBe('Fresh limit! 🎉');
    expect(celebrationText(['5h', '7d']).message).toBe('Your weekly limit just reset. Go build something great.');
  });
});
