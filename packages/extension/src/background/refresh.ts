import { snapshotDataSchema, type LiveCapture, type SnapshotData, type WindowKey } from '@paceline/shared';
import { EMPTY_ALERTS, alertMessage, evaluateAlerts } from '../core/alerts';
import { computeBadge, type Badge, type Conn } from '../core/badge';
import { forecastAll, type Forecasts } from '../core/forecast';
import { addDailyUsage, cycleHigh, habitSummary, pruneDaily, type HabitSummary } from '../core/habits';
import { STALE_MS, resolveLimits, type ResolvedLimits } from '../core/limits';
import { EMPTY_PACE_ALERTS, evaluatePaceAlerts, paceAlertMessage } from '../core/paceAlert';
import { appendReading } from '../core/readings';
import { CELEBRATE_BADGE_MS, EMPTY_TRACKER, celebrationText, detectResets, resetAlarms } from '../core/resets';
import { inQuietHours, mergeSettings } from '../core/settings';
import { EMPTY_FALLBACK_STATUS, FALLBACK_COOLDOWN_MS, shouldTryFallback, type FallbackResult } from '../platform/fallback';
import { callHost, type SendNative } from '../platform/native';
import type { Store } from './store';

export interface RefreshDeps {
  now: () => number;
  store: Store;
  send: SendNative;
  setBadge: (b: Badge) => Promise<void>;
  notify: (id: string, n: { title: string; message: string }) => Promise<void>;
  scheduleAlarm: (name: string, when: number) => Promise<void>;
  fallback: { permitted: () => Promise<boolean>; fetch: () => Promise<FallbackResult> };
}

export interface RefreshOutcome {
  conn: Conn;
  limits: ResolvedLimits;
  snapshot: SnapshotData | null;
  errorMessage: string | null;
  celebratePending: boolean;
  forecasts: Forecasts;
  habits: HabitSummary;
}

export async function refresh(d: RefreshDeps, window: WindowKey = '5h'): Promise<RefreshOutcome> {
  const now = d.now();
  const settings = mergeSettings(await d.store.get('settings'));

  const res = await callHost(d.send, { type: 'snapshot', window }, snapshotDataSchema);
  const conn: Conn = res.ok ? 'ok' : res.kind;
  const snapshot = res.ok ? res.data : null;
  const capture: LiveCapture | null = snapshot?.live.capture ?? (await d.store.get('capture')) ?? null;

  let fallback = (await d.store.get('fallback')) ?? null;
  let fallbackStatus = (await d.store.get('fallbackStatus')) ?? EMPTY_FALLBACK_STATUS;
  const captureFresh = capture !== null && now - capture.capturedAt < STALE_MS;
  const permitted = settings.fallbackEnabled ? await d.fallback.permitted() : false;
  if (shouldTryFallback({ enabled: settings.fallbackEnabled, permitted, captureFresh, status: fallbackStatus, now })) {
    const r = await d.fallback.fetch();
    if (r.ok) {
      fallback = r.reading;
      fallbackStatus = { lastAttemptAt: now, disabledUntil: null, reason: null };
    } else {
      fallbackStatus = { lastAttemptAt: now, disabledUntil: now + FALLBACK_COOLDOWN_MS, reason: r.reason };
    }
  }
  const limits = resolveLimits({ capture, fallback: settings.fallbackEnabled ? fallback : null, now });
  const stored = (await d.store.get('readings')) ?? [];
  const readings = appendReading(stored, limits, now);
  const newest = readings.at(-1);
  let dailyUsage = (await d.store.get('dailyUsage')) ?? {};
  if (newest && newest.t !== stored.at(-1)?.t) dailyUsage = addDailyUsage(dailyUsage, cycleHigh(stored, newest), newest);
  dailyUsage = pruneDaily(dailyUsage, now);
  const forecasts = forecastAll(readings, limits, now);

  const quiet = !settings.notifications || inQuietHours(settings, new Date(now));
  const resets = detectResets((await d.store.get('tracker')) ?? EMPTY_TRACKER, limits, now, settings.celebrationThreshold);
  let celebrateUntil = (await d.store.get('celebrateUntil')) ?? null;
  let celebratePending = (await d.store.get('celebratePending')) ?? false;
  if (resets.celebrate.length > 0) {
    celebrateUntil = now + CELEBRATE_BADGE_MS;
    celebratePending = true;
    if (!quiet) await d.notify(`celebrate:${now}`, celebrationText(resets.celebrate));
  }

  const alerts = evaluateAlerts((await d.store.get('alerts')) ?? EMPTY_ALERTS, limits, settings.thresholds);
  // One id per window cycle and threshold: a repeat replaces the notification instead of stacking.
  if (!quiet) {
    for (const a of alerts.fire) await d.notify(`alert:${a.window}:${a.threshold}:${a.resetsAt ?? now}`, alertMessage(a, now, undefined, forecasts[a.window]));
  }

  const pace = evaluatePaceAlerts((await d.store.get('paceAlerts')) ?? EMPTY_PACE_ALERTS, forecasts, limits, now);
  // A threshold alert sent in this same refresh already carries the forecast; don't say it twice.
  const announced = new Set(alerts.fire.map((a) => a.window));
  if (!quiet && settings.paceAlerts) {
    for (const p of pace.fire) if (!announced.has(p.window)) await d.notify(`pace:${p.window}:${p.resetsAt}`, paceAlertMessage(p, now));
  }

  await d.setBadge(computeBadge({ limits, conn, settings, celebrateUntil, now }));
  for (const alarm of resetAlarms(limits, now)) await d.scheduleAlarm(alarm.name, alarm.when);

  await d.store.set({ capture, fallback, fallbackStatus, limits, conn, tracker: resets.next, alerts: alerts.state, celebrateUntil, celebratePending, readings, paceAlerts: pace.state, dailyUsage });
  return { conn, limits, snapshot, errorMessage: res.ok ? null : res.message, celebratePending, forecasts, habits: habitSummary(dailyUsage, settings.dailyBudgetPct, now) };
}
