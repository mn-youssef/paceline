import { describe, expect, it } from 'vitest';
import { EMPTY_FALLBACK_STATUS, fetchClaudeAiUsage, shouldTryFallback } from '../src/platform/fallback';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const ORGS = 'https://claude.ai/api/organizations';
const USAGE = 'https://claude.ai/api/organizations/org-1/usage';

const fakeFetch = (routes: Record<string, { status: number; body: unknown }>): typeof fetch =>
  (async (input: string | URL | Request) => {
    const route = routes[String(input)];
    if (!route) throw new TypeError('network down');
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as typeof fetch;

describe('fetchClaudeAiUsage', () => {
  it('reads both windows', async () => {
    const r = await fetchClaudeAiUsage(
      fakeFetch({
        [ORGS]: { status: 200, body: [{ uuid: 'org-1', name: 'Me' }] },
        [USAGE]: {
          status: 200,
          body: {
            five_hour: { utilization: 37, resets_at: '2026-10-13T15:40:00Z' },
            seven_day: { utilization: 12.5, resets_at: '2026-10-19T09:00:00Z' },
            seven_day_opus: null,
          },
        },
      }),
      NOW,
    );
    expect(r).toEqual({
      ok: true,
      reading: {
        fetchedAt: NOW,
        fiveHour: { usedPct: 37, resetsAt: Date.parse('2026-10-13T15:40:00Z') },
        sevenDay: { usedPct: 12.5, resetsAt: Date.parse('2026-10-19T09:00:00Z') },
      },
    });
  });

  it('explains HTTP failures', async () => {
    expect(await fetchClaudeAiUsage(fakeFetch({ [ORGS]: { status: 403, body: {} } }), NOW)).toEqual({ ok: false, reason: 'organizations: HTTP 403' });
  });

  it('explains unexpected shapes', async () => {
    const r = await fetchClaudeAiUsage(fakeFetch({ [ORGS]: { status: 200, body: [{ uuid: 'org-1' }] }, [USAGE]: { status: 200, body: { five_hour: 'full' } } }), NOW);
    expect(r).toEqual({ ok: false, reason: 'usage: unexpected response' });
  });

  it('survives network errors', async () => {
    expect(await fetchClaudeAiUsage(fakeFetch({}), NOW)).toEqual({ ok: false, reason: 'network down' });
  });
});

describe('shouldTryFallback', () => {
  const base = { enabled: true, permitted: true, captureFresh: false, status: EMPTY_FALLBACK_STATUS, now: NOW };

  it('runs only when enabled, permitted and Claude Code data is stale', () => {
    expect(shouldTryFallback(base)).toBe(true);
    expect(shouldTryFallback({ ...base, enabled: false })).toBe(false);
    expect(shouldTryFallback({ ...base, permitted: false })).toBe(false);
    expect(shouldTryFallback({ ...base, captureFresh: true })).toBe(false);
  });

  it('waits five minutes between attempts and an hour after a failure', () => {
    expect(shouldTryFallback({ ...base, status: { lastAttemptAt: NOW - 60_000, disabledUntil: null, reason: null } })).toBe(false);
    expect(shouldTryFallback({ ...base, status: { lastAttemptAt: NOW - 400_000, disabledUntil: null, reason: null } })).toBe(true);
    expect(shouldTryFallback({ ...base, status: { lastAttemptAt: NOW - 400_000, disabledUntil: NOW + 1, reason: 'x' } })).toBe(false);
  });
});
