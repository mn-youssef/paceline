import { describe, expect, it } from 'vitest';
import { percent, topEntries, totalTokens } from '../src/dashboard/projects';

describe('totalTokens', () => {
  it('adds up all four token counts', () => {
    expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10);
  });
});

describe('percent', () => {
  it('rounds to whole percents and shows tiny shares as <1%', () => {
    expect(percent(1, 4)).toBe('25%');
    expect(percent(1_000, 2_321_000)).toBe('<1%');
    expect(percent(0, 10)).toBe('0%');
    expect(percent(5, 0)).toBe('0%');
  });
});

describe('topEntries', () => {
  it('keeps the largest non-zero entries and counts the rest', () => {
    const rec = { a: 1, b: 5, c: 0, d: 3, e: 2 };
    expect(topEntries(rec, 2)).toEqual({ items: [{ label: 'b', value: 5 }, { label: 'd', value: 3 }], more: 2 });
    expect(topEntries({})).toEqual({ items: [], more: 0 });
  });
});
