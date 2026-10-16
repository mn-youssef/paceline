import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, inQuietHours, mergeSettings, parseBudget, parseThresholds, type Settings } from '../src/core/settings';

const quiet = (start: string, end: string): Settings => ({ ...DEFAULT_SETTINGS, quietHours: { enabled: true, start, end } });

describe('mergeSettings', () => {
  it('has habit and dashboard defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ dailyBudgetPct: 14, weeklyDigest: true, plan: 'max5', shareShowProjects: false });
  });

  it('turns pace alerts on by default', () => {
    expect(DEFAULT_SETTINGS.paceAlerts).toBe(true);
    expect(mergeSettings({ paceAlerts: false }).paceAlerts).toBe(false);
  });

  it('returns defaults when nothing is stored', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing fields, including nested quiet hours', () => {
    expect(mergeSettings({ thresholds: [70], quietHours: { enabled: true } })).toEqual({
      ...DEFAULT_SETTINGS,
      thresholds: [70],
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    });
  });
});

describe('inQuietHours', () => {
  it('handles windows that cross midnight', () => {
    const s = quiet('22:00', '08:00');
    expect(inQuietHours(s, new Date(2026, 9, 13, 23, 30))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 9, 13, 7, 59))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 9, 13, 8, 0))).toBe(false);
  });

  it('handles same-day windows and the off switch', () => {
    expect(inQuietHours(quiet('12:00', '14:00'), new Date(2026, 9, 13, 13, 0))).toBe(true);
    expect(inQuietHours(quiet('12:00', '14:00'), new Date(2026, 9, 13, 15, 0))).toBe(false);
    expect(inQuietHours(DEFAULT_SETTINGS, new Date(2026, 9, 13, 23, 0))).toBe(false);
  });
});

describe('parseThresholds', () => {
  it('keeps unique whole percentages between 1 and 100, sorted', () => {
    expect(parseThresholds('95, 50,80 50 120 x')).toEqual([50, 80, 95]);
  });

  it('falls back to the defaults when nothing usable is left', () => {
    expect(parseThresholds('')).toEqual([50, 80, 95]);
  });
});

describe('parseBudget', () => {
  it('parses the daily budget, keeping the previous value for empty or invalid input', () => {
    expect(parseBudget('20', 14)).toBe(20);
    expect(parseBudget(' 7 ', 14)).toBe(7);
    expect(parseBudget('', 14)).toBe(14);
    expect(parseBudget('abc', 14)).toBe(14);
    expect(parseBudget('0', 14)).toBe(1);
    expect(parseBudget('250', 14)).toBe(100);
  });
});
