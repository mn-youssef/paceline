import { describe, expect, it } from 'vitest';
import type { LiveCapture } from '@paceline/shared';
import { NO_LIMITS, resolveLimits } from '../src/core/limits';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const MIN = 60_000;
const capture = (over: Partial<LiveCapture> = {}): LiveCapture => ({
  capturedAt: NOW - MIN,
  sessionId: null,
  model: null,
  fiveHour: { usedPct: 42, resetsAt: NOW + 60 * MIN },
  sevenDay: { usedPct: 18, resetsAt: NOW + 24 * 60 * MIN },
  ...over,
});

describe('resolveLimits', () => {
  it('prefers a fresh Claude Code capture', () => {
    const fallback = { fetchedAt: NOW, fiveHour: { usedPct: 99, resetsAt: NOW + MIN }, sevenDay: null };
    expect(resolveLimits({ capture: capture(), fallback, now: NOW })).toEqual({
      fiveHour: { pct: 42, resetsAt: NOW + 60 * MIN },
      sevenDay: { pct: 18, resetsAt: NOW + 24 * 60 * MIN },
      source: 'claude-code',
      updatedAt: NOW - MIN,
    });
  });

  it('uses a fresh claude.ai reading when the capture is stale', () => {
    const fallback = { fetchedAt: NOW - MIN, fiveHour: { usedPct: 61, resetsAt: NOW + 30 * MIN }, sevenDay: null };
    expect(resolveLimits({ capture: capture({ capturedAt: NOW - 20 * MIN }), fallback, now: NOW })).toMatchObject({
      fiveHour: { pct: 61 },
      sevenDay: null,
      source: 'claude-ai',
    });
  });

  it('falls back to the newest stale reading', () => {
    const fallback = { fetchedAt: NOW - 40 * MIN, fiveHour: { usedPct: 10, resetsAt: NOW + MIN }, sevenDay: null };
    expect(resolveLimits({ capture: capture({ capturedAt: NOW - 20 * MIN }), fallback, now: NOW })).toMatchObject({
      fiveHour: { pct: 42 },
      source: 'stale',
      updatedAt: NOW - 20 * MIN,
    });
  });

  it('treats a window whose reset time has passed as empty', () => {
    const r = resolveLimits({ capture: capture({ capturedAt: NOW - 20 * MIN, fiveHour: { usedPct: 88, resetsAt: NOW - 1 } }), fallback: null, now: NOW });
    expect(r.fiveHour).toEqual({ pct: 0, resetsAt: null });
  });

  it('reports none without readings', () => {
    expect(resolveLimits({ capture: null, fallback: null, now: NOW })).toEqual(NO_LIMITS);
  });
});
