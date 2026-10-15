import { describe, expect, it } from 'vitest';
import { pingDataSchema } from '@paceline/shared';
import { callHost } from '../src/platform/native';

const ping = { helperVersion: '0.1.0', protocol: 1, statusLineInstalled: true, lastStatusLineAt: null };
const reply = (body: unknown) => async () => body;

describe('callHost', () => {
  it('returns validated data', async () => {
    expect(await callHost(reply({ v: 1, id: 'x', ok: true, data: ping }), { type: 'ping' }, pingDataSchema)).toEqual({ ok: true, data: ping });
  });

  it('stamps the protocol version and an id on the request', async () => {
    let sent: unknown;
    await callHost(async (m) => { sent = m; return { v: 1, id: 'x', ok: true, data: ping }; }, { type: 'snapshot', window: '7d' }, pingDataSchema);
    expect(sent).toMatchObject({ v: 1, type: 'snapshot', window: '7d', id: expect.any(String) });
  });

  it('reports a missing host as unreachable', async () => {
    const send = async () => { throw new Error('Specified native messaging host not found.'); };
    expect(await callHost(send, { type: 'ping' }, pingDataSchema)).toEqual({ ok: false, kind: 'unreachable', message: 'Specified native messaging host not found.' });
  });

  it('reports protocol mismatches and unexpected data as mismatch', async () => {
    const old = reply({ v: 1, id: 'x', ok: false, error: { code: 'PROTOCOL_MISMATCH', message: 'old helper' } });
    expect(await callHost(old, { type: 'ping' }, pingDataSchema)).toMatchObject({ ok: false, kind: 'mismatch' });
    expect(await callHost(reply({ v: 1, id: 'x', ok: true, data: { nope: 1 } }), { type: 'ping' }, pingDataSchema)).toMatchObject({ ok: false, kind: 'mismatch' });
  });

  it('treats a request the helper cannot parse as a helper that needs an update', async () => {
    // The extension only sends schema-valid requests, so BAD_REQUEST means an older helper.
    const old = reply({ v: 1, id: 'x', ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid discriminator value' } });
    expect(await callHost(old, { type: 'dashboard', range: '7d' }, pingDataSchema)).toMatchObject({ ok: false, kind: 'mismatch' });
  });

  it('passes helper errors through', async () => {
    const broken = reply({ v: 1, id: 'x', ok: false, error: { code: 'INTERNAL', message: 'disk full' } });
    expect(await callHost(broken, { type: 'ping' }, pingDataSchema)).toEqual({ ok: false, kind: 'error', message: 'disk full' });
  });
});
