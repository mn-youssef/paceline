import { describe, expect, it } from 'vitest';
import { allowedExtensionIds } from '../src/extensionIds';

const DEV = 'cchmkmfoocjlfkogepngoklnehiofpco';
const STORE = 'abcdefghijklmnopabcdefghijklmnop';

describe('allowedExtensionIds', () => {
  it('development build trusts the dev ID, and the store ID once set', () => {
    expect(allowedExtensionIds(false, DEV, null)).toEqual([DEV]);
    expect(allowedExtensionIds(false, DEV, STORE)).toEqual([DEV, STORE]);
  });

  it('release build trusts only the store ID', () => {
    expect(allowedExtensionIds(true, DEV, STORE)).toEqual([STORE]);
  });

  it('release build without a store ID is an error', () => {
    expect(() => allowedExtensionIds(true, DEV, null)).toThrow(/store extension ID/);
  });
});
