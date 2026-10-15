import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { hostMain } from '../src/host';
import { decodeMessage, encodeMessage } from '../src/native/framing';
import { resolvePaths } from '../src/paths';
import { tempHome } from './fixtures/lines';

async function talk(frames: Buffer[]): Promise<unknown> {
  const out: Buffer[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      out.push(Buffer.from(chunk));
      cb();
    },
  });
  await hostMain({ stdin: Readable.from(frames), stdout, paths: resolvePaths(tempHome()), now: () => 1 });
  return decodeMessage(Buffer.concat(out))?.message;
}

describe('hostMain', () => {
  it('answers one framed request on stdout', async () => {
    expect(await talk([encodeMessage({ v: 1, id: 'p', type: 'ping' })])).toMatchObject({ v: 1, id: 'p', ok: true, data: { protocol: 1 } });
  });

  it('reports a truncated frame as BAD_REQUEST', async () => {
    expect(await talk([Buffer.from([1, 0])])).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });
});
