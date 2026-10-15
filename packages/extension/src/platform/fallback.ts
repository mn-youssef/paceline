import { z } from 'zod';
import type { RateWindow } from '@paceline/shared';
import type { FallbackReading } from '../core/limits';

export type FallbackResult = { ok: true; reading: FallbackReading } | { ok: false; reason: string };

export interface FallbackStatus {
  lastAttemptAt: number | null;
  disabledUntil: number | null;
  reason: string | null;
}

export const EMPTY_FALLBACK_STATUS: FallbackStatus = { lastAttemptAt: null, disabledUntil: null, reason: null };
export const FALLBACK_INTERVAL_MS = 5 * 60_000;
export const FALLBACK_COOLDOWN_MS = 60 * 60_000;

// Undocumented claude.ai endpoint (the one behind Settings > Usage). Opt-in and labelled unofficial.
const BASE = 'https://claude.ai/api/organizations';
const windowSchema = z.object({ utilization: z.number(), resets_at: z.string().nullable() }).nullable().optional();
const usageSchema = z.object({ five_hour: windowSchema, seven_day: windowSchema });
const orgsSchema = z.array(z.object({ uuid: z.string() }));

function toWindow(w: z.infer<typeof windowSchema>): RateWindow | null {
  if (!w || !w.resets_at) return null;
  const resetsAt = Date.parse(w.resets_at);
  return Number.isFinite(resetsAt) ? { usedPct: w.utilization, resetsAt } : null;
}

export async function fetchClaudeAiUsage(fetchFn: typeof fetch, now: number): Promise<FallbackResult> {
  try {
    const orgsRes = await fetchFn(BASE, { credentials: 'include' });
    if (!orgsRes.ok) return { ok: false, reason: `organizations: HTTP ${orgsRes.status}` };
    const orgs = orgsSchema.safeParse(await orgsRes.json());
    if (!orgs.success || orgs.data.length === 0) return { ok: false, reason: 'organizations: unexpected response' };
    const res = await fetchFn(`${BASE}/${orgs.data[0]!.uuid}/usage`, { credentials: 'include' });
    if (!res.ok) return { ok: false, reason: `usage: HTTP ${res.status}` };
    const usage = usageSchema.safeParse(await res.json());
    if (!usage.success) return { ok: false, reason: 'usage: unexpected response' };
    const reading: FallbackReading = { fetchedAt: now, fiveHour: toWindow(usage.data.five_hour), sevenDay: toWindow(usage.data.seven_day) };
    if (!reading.fiveHour && !reading.sevenDay) return { ok: false, reason: 'usage: no limit windows reported' };
    return { ok: true, reading };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function shouldTryFallback(i: { enabled: boolean; permitted: boolean; captureFresh: boolean; status: FallbackStatus; now: number }): boolean {
  if (!i.enabled || !i.permitted || i.captureFresh) return false;
  if (i.status.disabledUntil !== null && i.now < i.status.disabledUntil) return false;
  return i.status.lastAttemptAt === null || i.now - i.status.lastAttemptAt >= FALLBACK_INTERVAL_MS;
}
