import { describe, expect, it } from 'vitest';
import { retryDelayMs, shouldShowLoadError } from '../src/dashboard/retry';

describe('dashboard retries', () => {
  it('backs off from 3 s to 30 s', () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual([3_000, 6_000, 12_000, 24_000, 30_000, 30_000]);
  });

  it('shows the error only without data or after three failures in a row', () => {
    expect(shouldShowLoadError(false, 1)).toBe(true);
    expect(shouldShowLoadError(true, 2)).toBe(false);
    expect(shouldShowLoadError(true, 3)).toBe(true);
  });
});
