import { describe, expect, it } from 'vitest';
import { formatAgo, formatClock, formatDuration, formatTokens, formatUsd } from '../src/core/format';

const FMT = { locale: 'en-GB', timeZone: 'UTC' };
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 13, 12, 0); // a Tuesday

describe('formatClock', () => {
  it('shows the time for today and adds the weekday otherwise', () => {
    expect(formatClock(Date.UTC(2026, 9, 13, 15, 40), NOW, FMT)).toBe('15:40');
    expect(formatClock(Date.UTC(2026, 9, 19, 9, 0), NOW, FMT)).toBe('Mon 09:00');
  });
});

describe('formatDuration', () => {
  it('scales from minutes to days', () => {
    expect(formatDuration(2 * HOUR + 5 * MIN)).toBe('2h 05m');
    expect(formatDuration(42 * MIN)).toBe('42m');
    expect(formatDuration(3 * DAY + 4 * HOUR)).toBe('3d 4h');
    expect(formatDuration(-5)).toBe('0m');
  });
});

describe('formatAgo', () => {
  it('reads naturally', () => {
    expect(formatAgo(30_000)).toBe('just now');
    expect(formatAgo(5 * MIN)).toBe('5 min ago');
    expect(formatAgo(3 * HOUR)).toBe('3h ago');
    expect(formatAgo(3 * DAY)).toBe('3d ago');
  });
});

describe('formatUsd and formatTokens', () => {
  it('keep numbers short', () => {
    expect([formatUsd(0.5), formatUsd(12.34), formatUsd(250.4)]).toEqual(['$0.50', '$12.3', '$250']);
    expect([formatTokens(999), formatTokens(42_000), formatTokens(1_250_000)]).toEqual(['999', '42k', '1.3M']);
  });
});
