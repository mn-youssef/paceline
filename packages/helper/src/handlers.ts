import {
  PROTOCOL_VERSION, hostRequestSchema, type DashboardData, type DashboardRange, type HostResponse, type PingData, type SnapshotData, type WindowKey,
} from '@paceline/shared';
import { buildDashboard } from './analysis/dashboard';
import { computeHiddenCosts } from './analysis/hidden';
import { auditProject, type ProjectOverhead } from './analysis/overhead';
import { aggregateSessions, computeTotals, toSummary, windowCost } from './analysis/summary';
import { assessSession } from './analysis/tips';
import { readJson } from './fsutil';
import { isOurStatusLine } from './install/settings';
import { readLive } from './live';
import type { Paths } from './paths';
import { scan } from './scan';
import { HELPER_VERSION } from './version';

const HOUR = 3_600_000;
export const WINDOW_MS: Record<WindowKey, number> = { '5h': 5 * HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR };
export const TOP_SESSIONS = 10;

export interface HandlerDeps {
  paths: Paths;
  now: () => number;
  budgetMs: number;
}

const fail = (id: string, code: 'PROTOCOL_MISMATCH' | 'BAD_REQUEST' | 'INTERNAL', message: string, extra: object = {}): HostResponse => ({
  v: PROTOCOL_VERSION,
  id,
  ok: false,
  error: { code, message, ...extra },
});

export async function handleRequest(raw: unknown, d: HandlerDeps): Promise<HostResponse> {
  const r = (raw ?? {}) as { v?: unknown; id?: unknown };
  const id = typeof r.id === 'string' ? r.id : '';
  if (r.v !== PROTOCOL_VERSION) {
    return fail(id, 'PROTOCOL_MISMATCH', `This helper speaks protocol ${PROTOCOL_VERSION}.`, { helperVersion: HELPER_VERSION, protocol: PROTOCOL_VERSION });
  }
  const parsed = hostRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(id, 'BAD_REQUEST', parsed.error.message);
  try {
    const req = parsed.data;
    const data = req.type === 'ping' ? ping(d) : req.type === 'snapshot' ? snapshot(d, req.window) : dashboard(d, req.range);
    return { v: PROTOCOL_VERSION, id, ok: true, data };
  } catch (e) {
    return fail(id, 'INTERNAL', e instanceof Error ? e.message : String(e));
  }
}

/** Project audits are cached per request: many sessions share a project. */
function makeOverheadFor(paths: Paths): (cwd: string) => ProjectOverhead {
  const claudeJson = readJson(paths.claudeJson);
  const audits = new Map<string, ProjectOverhead>();
  return (cwd) => {
    let o = audits.get(cwd);
    if (!o) {
      o = auditProject(cwd, paths, claudeJson);
      audits.set(cwd, o);
    }
    return o;
  };
}

function ping(d: HandlerDeps): PingData {
  const settings = readJson<{ statusLine?: unknown }>(d.paths.claudeSettings);
  return {
    helperVersion: HELPER_VERSION,
    protocol: PROTOCOL_VERSION,
    statusLineInstalled: isOurStatusLine(settings?.statusLine),
    lastStatusLineAt: readLive(d.paths).lastSeenAt,
  };
}

function snapshot(d: HandlerDeps, window: WindowKey): SnapshotData {
  const now = d.now();
  const windowStart = now - WINDOW_MS[window];
  const result = scan({ paths: d.paths, now, budgetMs: d.budgetMs });
  const inWindow = aggregateSessions(result.states).filter((a) => a.endedAt >= windowStart);
  const ranked = inWindow
    .map((a) => ({ a, cost: windowCost(a.hourly, windowStart) }))
    .sort((x, y) => y.cost - x.cost);

  const overheadFor = makeOverheadFor(d.paths);

  return {
    live: readLive(d.paths),
    topSessions: ranked.slice(0, TOP_SESSIONS).map(({ a }) => {
      const { tips, score, grade } = assessSession(a, overheadFor(a.projectPath));
      return toSummary(a, windowStart, tips, { score, grade });
    }),
    totals: computeTotals(inWindow, windowStart),
    indexing: !result.complete,
    truncated: ranked.length > TOP_SESSIONS,
    hiddenCosts: computeHiddenCosts(inWindow, windowStart, overheadFor),
  };
}

function dashboard(d: HandlerDeps, range: DashboardRange): DashboardData {
  const now = d.now();
  const result = scan({ paths: d.paths, now, budgetMs: d.budgetMs });
  return buildDashboard(aggregateSessions(result.states), range, now, makeOverheadFor(d.paths), undefined, !result.complete);
}
