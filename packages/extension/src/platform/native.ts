import { PROTOCOL_VERSION, hostResponseSchema, type HostRequest } from '@paceline/shared';
import type { z } from 'zod';

export type SendNative = (message: unknown) => Promise<unknown>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<HostRequest, 'v' | 'id'>;
export type NativeResult<T> = { ok: true; data: T } | { ok: false; kind: 'unreachable' | 'mismatch' | 'error'; message: string };

let counter = 0;

export async function callHost<T>(send: SendNative, body: RequestBody, schema: z.ZodType<T>): Promise<NativeResult<T>> {
  let raw: unknown;
  try {
    raw = await send({ v: PROTOCOL_VERSION, id: `req-${Date.now()}-${++counter}`, ...body });
  } catch (e) {
    return { ok: false, kind: 'unreachable', message: e instanceof Error ? e.message : String(e) };
  }
  const envelope = hostResponseSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, kind: 'mismatch', message: 'The helper sent a response this extension does not understand.' };
  const res = envelope.data;
  if (!res.ok) {
    // This extension only sends valid requests, so BAD_REQUEST means an older helper that lacks the request type.
    const outdated = res.error.code === 'PROTOCOL_MISMATCH' || res.error.code === 'BAD_REQUEST';
    return { ok: false, kind: outdated ? 'mismatch' : 'error', message: res.error.message };
  }
  if (res.v !== PROTOCOL_VERSION) return { ok: false, kind: 'mismatch', message: `The helper speaks protocol ${res.v}.` };
  const data = schema.safeParse(res.data);
  if (!data.success) return { ok: false, kind: 'mismatch', message: 'The helper data does not match this extension version.' };
  return { ok: true, data: data.data };
}
