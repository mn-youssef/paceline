import { describe, expect, it } from 'vitest';
import { pickStoreId } from '../release-ids.mjs';

const COMMITTED = 'ponmlkjihgfedcbaponmlkjihgfedcba';
const REHEARSAL = 'abcdefghijklmnopabcdefghijklmnop';

describe('pickStoreId', () => {
  it('uses the committed store ID for a release', () => {
    expect(pickStoreId({ release: true, committedId: COMMITTED, publishing: false })).toBe(COMMITTED);
  });

  it('accepts a rehearsal ID only while none is committed', () => {
    expect(pickStoreId({ release: true, envId: REHEARSAL, committedId: null, publishing: false })).toBe(REHEARSAL);
    expect(() => pickStoreId({ release: true, envId: REHEARSAL, committedId: COMMITTED, publishing: false })).toThrow(/differs from the committed store ID/);
  });

  it('never publishes with a rehearsal ID', () => {
    expect(() => pickStoreId({ release: true, envId: REHEARSAL, committedId: null, publishing: true })).toThrow(/only for rehearsals/);
  });

  it('refuses a release without a store ID, or with a malformed one', () => {
    expect(() => pickStoreId({ release: true, committedId: null, publishing: false })).toThrow(/needs the store extension ID/);
    expect(() => pickStoreId({ release: true, envId: 'nope', committedId: null, publishing: false })).toThrow(/PACELINE_STORE_ID must be 32 letters/);
  });

  it('gives a development build the committed ID and ignores the environment', () => {
    expect(pickStoreId({ release: false, envId: REHEARSAL, committedId: null, publishing: false })).toBeNull();
    expect(pickStoreId({ release: false, committedId: COMMITTED, publishing: false })).toBe(COMMITTED);
  });
});
