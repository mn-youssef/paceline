import { dashboardDataSchema } from '@paceline/shared';
import { buildDigest, dueDigestWeek, nextDigestAt } from '../core/digest';
import { inQuietHours, mergeSettings } from '../core/settings';
import { callHost } from '../platform/native';
import type { RefreshDeps } from './refresh';

export type DigestDeps = Pick<RefreshDeps, 'now' | 'store' | 'send' | 'notify' | 'scheduleAlarm'>;

/** Cheap unless a digest is due: safe to call on every tick as well as from its alarm. */
export async function runDigest(d: DigestDeps): Promise<'sent' | 'skipped' | 'not-due'> {
  const now = d.now();
  await d.scheduleAlarm('digest', nextDigestAt(now));
  const settings = mergeSettings(await d.store.get('settings'));
  const week = dueDigestWeek((await d.store.get('lastDigestWeek')) ?? null, now);
  if (!week || !settings.weeklyDigest || !settings.notifications || inQuietHours(settings, new Date(now))) return 'not-due';
  const res = await callHost(d.send, { type: 'dashboard', range: '30d' }, dashboardDataSchema);
  // A half-indexed history would give a wrong week; the next tick continues the scan.
  if (!res.ok || res.data.indexing) return 'not-due';
  const digest = buildDigest(res.data, (await d.store.get('dailyUsage')) ?? {}, settings.dailyBudgetPct, now);
  await d.store.set({ lastDigestWeek: week });
  if (!digest) return 'skipped';
  await d.notify(`digest:${week}`, digest);
  return 'sent';
}
