import { describe, expect, it } from 'vitest';
import { totalTokens } from '../src/dashboard/projects';

describe('totalTokens', () => {
  it('adds up all four token counts', () => {
    expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10);
  });
});
