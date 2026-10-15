import type { LiveCapture } from '@paceline/shared';
import type { AlertState } from '../core/alerts';
import type { Conn } from '../core/badge';
import type { DailyUsage } from '../core/habits';
import type { FallbackReading, ResolvedLimits } from '../core/limits';
import type { PaceAlertState } from '../core/paceAlert';
import type { Reading } from '../core/readings';
import type { ResetTracker } from '../core/resets';
import type { StoredSettings } from '../core/settings';
import type { FallbackStatus } from '../platform/fallback';

/** Everything the service worker must remember between wake-ups. */
export interface StoreShape {
  settings: StoredSettings;
  capture: LiveCapture | null;
  fallback: FallbackReading | null;
  fallbackStatus: FallbackStatus;
  alerts: AlertState;
  tracker: ResetTracker;
  celebrateUntil: number | null;
  celebratePending: boolean;
  conn: Conn;
  limits: ResolvedLimits;
  readings: Reading[];
  paceAlerts: PaceAlertState;
  dailyUsage: DailyUsage;
  lastDigestWeek: string | null;
}

export interface Store {
  get<K extends keyof StoreShape>(key: K): Promise<StoreShape[K] | undefined>;
  set(patch: Partial<StoreShape>): Promise<void>;
}

export function memoryStore(init: Partial<StoreShape> = {}): Store & { data: Partial<StoreShape> } {
  const data: Partial<StoreShape> = { ...init };
  return {
    data,
    get: async (key) => data[key],
    set: async (patch) => {
      Object.assign(data, patch);
    },
  };
}
