export type BadgeWindow = 'higher' | '5h' | '7d';
export type Plan = 'pro' | 'max5' | 'max20' | 'api';

export interface Settings {
  thresholds: number[];
  badgeWindow: BadgeWindow;
  notifications: boolean;
  paceAlerts: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  celebrationThreshold: number;
  fallbackEnabled: boolean;
  dailyBudgetPct: number;
  weeklyDigest: boolean;
  plan: Plan;
  shareShowProjects: boolean;
}

export type StoredSettings = Partial<Omit<Settings, 'quietHours'>> & { quietHours?: Partial<Settings['quietHours']> };

export const DEFAULT_SETTINGS: Settings = {
  thresholds: [50, 80, 95],
  badgeWindow: 'higher',
  notifications: true,
  paceAlerts: true,
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  celebrationThreshold: 50,
  fallbackEnabled: false,
  dailyBudgetPct: 14,
  weeklyDigest: true,
  plan: 'max5',
  shareShowProjects: false,
};

export function mergeSettings(stored: StoredSettings | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored, quietHours: { ...DEFAULT_SETTINGS.quietHours, ...stored?.quietHours } };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Local-time check; a window like 22:00–08:00 crosses midnight. */
export function inQuietHours(s: Settings, at: Date): boolean {
  if (!s.quietHours.enabled) return false;
  const start = toMinutes(s.quietHours.start);
  const end = toMinutes(s.quietHours.end);
  if (start === null || end === null || start === end) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  return start < end ? m >= start && m < end : m >= start || m < end;
}

export function parseThresholds(text: string): number[] {
  const values = text
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100)
    .map((n) => Math.round(n));
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...DEFAULT_SETTINGS.thresholds];
}
