import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeMessage, readOneMessage } from '../src/native/framing';

describe('native messaging framing', () => {
  it('round-trips a message with a little-endian length prefix', () => {
    const msg = { a: 1, s: 'héllo' };
    const buf = encodeMessage(msg);
    expect(buf.readUInt32LE(0)).toBe(Buffer.byteLength(JSON.stringify(msg)));
    expect(decodeMessage(buf)).toEqual({ message: msg, rest: Buffer.alloc(0) });
  });

  it('waits for a complete frame', () => {
    const buf = encodeMessage({ a: 1 });
    expect(decodeMessage(buf.subarray(0, 3))).toBeNull();
    expect(decodeMessage(buf.subarray(0, buf.length - 1))).toBeNull();
  });

  it('reads one message from a chunked stream', async () => {
    const buf = encodeMessage({ type: 'ping' });
    const stream = Readable.from([buf.subarray(0, 2), buf.subarray(2, 7), buf.subarray(7)]);
    expect(await readOneMessage(stream)).toEqual({ type: 'ping' });
  });

  it('rejects when the stream ends early', async () => {
    await expect(readOneMessage(Readable.from([Buffer.from([5, 0])]))).rejects.toThrow(/closed/);
  });
});
