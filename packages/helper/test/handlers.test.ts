import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { snapshotDataSchema } from '@paceline/shared';
import { writeJsonAtomic } from '../src/fsutil';
import { handleRequest } from '../src/handlers';
import { resolvePaths } from '../src/paths';
import { HELPER_VERSION } from '../src/version';
import { HOUR, MIN, T0, assistantLine, tempHome, writeLog } from './fixtures/lines';

const NOW = T0 + 4 * HOUR;
const deps = (home: string) => ({ paths: resolvePaths(home), now: () => NOW, budgetMs: Number.POSITIVE_INFINITY });

describe('handleRequest', () => {
  it('answers dashboard requests', async () => {
    const home = tempHome();
    writeLog(home, '-Users-dev-my-app', 's1', [assistantLine({ id: 'm0', at: 3 * HOUR })]);
    const r = await handleRequest({ v: 1, id: 'd', type: 'dashboard', range: '7d' }, deps(home));
    expect(r.ok).toBe(true);
    const data = (r as { data: { days: unknown[]; sessions: { sessionId: string }[] } }).data;
    expect(data.days).toHaveLength(7);
    expect(data.sessions.map((s) => s.sessionId)).toEqual(['s1']);
  });

  it('rejects other protocol versions', async () => {
    expect(await handleRequest({ v: 99, id: 'x', type: 'ping' }, deps(tempHome()))).toEqual({
      v: 1,
      id: 'x',
      ok: false,
      error: { code: 'PROTOCOL_MISMATCH', message: expect.any(String), helperVersion: HELPER_VERSION, protocol: 1 },
    });
  });

  it('rejects malformed requests', async () => {
    const r = await handleRequest({ v: 1, id: 'x', type: 'snapshot', window: '1y' }, deps(tempHome()));
    expect(r).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('answers ping with the status line state', async () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    mkdirSync(paths.claudeDir, { recursive: true });
    writeFileSync(paths.claudeSettings, JSON.stringify({ statusLine: { type: 'command', command: '"/usr/bin/node" "/h/.paceline/paceline.cjs" statusline' } }));
    writeJsonAtomic(paths.live, { lastSeenAt: 123, capture: null });
    expect(await handleRequest({ v: 1, id: 'p', type: 'ping' }, deps(home))).toEqual({
      v: 1,
      id: 'p',
      ok: true,
      data: { helperVersion: HELPER_VERSION, protocol: 1, statusLineInstalled: true, lastStatusLineAt: 123 },
    });
  });

  it('ranks sessions by cost inside the window and attaches tips', async () => {
    const home = tempHome();
    // 180 one-minute turns that each re-read 120k tokens of context: a classic long session.
    const long = Array.from({ length: 180 }, (_, i) => assistantLine({ id: `l${i}`, at: i * MIN, usage: { cache_read_input_tokens: 120_000 } }));
    writeLog(home, '-Users-dev-my-app', 'long', long);
    writeLog(home, '-Users-dev-my-app', 'small', [assistantLine({ id: 's0', at: 3 * HOUR })]);
    writeLog(home, '-Users-dev-my-app', 'old', [assistantLine({ id: 'o0', at: -10 * HOUR, usage: { input_tokens: 5_000_000 } })]);

    const r = await handleRequest({ v: 1, id: 's', type: 'snapshot', window: '5h' }, deps(home));
    expect(r.ok).toBe(true);
    const data = snapshotDataSchema.parse((r as { data: unknown }).data);
    expect(data.topSessions.map((s) => s.sessionId)).toEqual(['long', 'small']);
    expect(data.topSessions[0]!.tips.map((t) => t.ruleId)).toContain('long-session');
    expect(data.topSessions[0]).toMatchObject({ grade: expect.stringMatching(/^[A-F]$/), score: expect.any(Number) });
    expect(data).toMatchObject({ indexing: false, truncated: false, totals: { sessions: 2 }, live: { lastSeenAt: null, capture: null } });
    expect(data.hiddenCosts?.setupOverhead.projects[0]?.projectName).toBe('my-app');
    expect(data.hiddenCosts?.longContext.turns).toBe(0);
  });
});
