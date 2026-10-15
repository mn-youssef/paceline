import { describe, expect, it } from 'vitest';
import { PRICES, costUsd, priceFor } from '../src/pricing';

describe('priceFor', () => {
  it('returns the exact row for a known id', () => {
    expect(priceFor('claude-opus-5-5')).toEqual({ id: 'claude-opus-5-5', price: PRICES['claude-opus-5-5'], estimated: false });
  });

  it('accepts date stamps and context tags after a known id', () => {
    expect(priceFor('claude-opus-4-8-20260115')).toMatchObject({ id: 'claude-opus-4-8', estimated: false });
    expect(priceFor('claude-opus-5-5[1m]')).toMatchObject({ id: 'claude-opus-5-5', estimated: false });
  });

  it('does not price a newer minor version as an older row', () => {
    expect(priceFor('claude-opus-5-9')).toMatchObject({ id: 'claude-opus-5-5', estimated: true });
  });

  it('falls back to the family, then to Sonnet', () => {
    expect(priceFor('claude-haiku-7')).toMatchObject({ id: 'claude-haiku-5-5', estimated: true });
    expect(priceFor('some-other-model')).toMatchObject({ id: 'claude-sonnet-5-5', estimated: true });
  });
});

describe('costUsd', () => {
  it('weights every token type by its own price', () => {
    const million = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6 };
    // Opus 5.5: 4 in + 20 out + 0.2 read + 5 (5m write) + 8 (1h write)
    expect(costUsd(million, PRICES['claude-opus-5-5']!)).toBeCloseTo(37.2, 9);
  });
});
