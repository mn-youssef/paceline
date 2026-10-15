import { describe, expect, it } from 'vitest';
import { dashboardDataSchema, hostRequestSchema, hostResponseSchema, sessionSummarySchema, snapshotDataSchema } from '../src/protocol';
import { makeDashboard, makeHiddenCosts, makeSnapshot, makeSummary, makeTip } from '../src/fixtures';

describe('protocol schemas', () => {
  it('accepts ping and snapshot requests', () => {
    expect(hostRequestSchema.parse({ v: 1, id: 'a', type: 'ping' }).type).toBe('ping');
    expect(hostRequestSchema.parse({ v: 1, id: 'a', type: 'snapshot', window: '24h' })).toMatchObject({ window: '24h' });
  });

  it('rejects an unknown window', () => {
    expect(hostRequestSchema.safeParse({ v: 1, id: 'a', type: 'snapshot', window: '1y' }).success).toBe(false);
  });

  it('validates the fixtures', () => {
    const snap = snapshotDataSchema.parse(makeSnapshot({ topSessions: [makeSummary({ tips: [makeTip()] })] }));
    expect(snap.topSessions[0]!.tips[0]!.ruleId).toBe('long-session');
  });

  it('requires every tool category in a session summary', () => {
    const s = makeSummary();
    const { web: _web, ...tools } = s.tools;
    expect(sessionSummarySchema.safeParse({ ...s, tools }).success).toBe(false);
  });

  it('parses success and error envelopes', () => {
    expect(hostResponseSchema.parse({ v: 1, id: 'x', ok: true, data: { a: 1 } }).ok).toBe(true);
    expect(hostResponseSchema.parse({ v: 1, id: 'x', ok: false, error: { code: 'PROTOCOL_MISMATCH', message: 'old' } }).ok).toBe(false);
  });

  it('accepts snapshots with and without hiddenCosts', () => {
    expect(snapshotDataSchema.parse(makeSnapshot()).hiddenCosts).toBeUndefined();
    expect(snapshotDataSchema.parse(makeSnapshot({ hiddenCosts: makeHiddenCosts() })).hiddenCosts?.subagents.share).toBe(0.34);
  });

  it('accepts dashboard requests and data', () => {
    expect(hostRequestSchema.parse({ v: 1, id: 'a', type: 'dashboard', range: '30d' })).toMatchObject({ type: 'dashboard', range: '30d' });
    expect(hostRequestSchema.safeParse({ v: 1, id: 'a', type: 'dashboard', range: '5h' }).success).toBe(false);
    expect(dashboardDataSchema.parse(makeDashboard()).heatmap).toHaveLength(7);
  });

  it('accepts session summaries with and without a grade', () => {
    expect(sessionSummarySchema.parse(makeSummary()).grade).toBeUndefined();
    expect(sessionSummarySchema.parse(makeSummary({ score: 72, grade: 'B' })).grade).toBe('B');
    expect(sessionSummarySchema.safeParse({ ...makeSummary(), grade: 'E' }).success).toBe(false);
  });
});
