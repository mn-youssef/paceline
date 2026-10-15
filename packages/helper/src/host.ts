import { PROTOCOL_VERSION, type HostResponse } from '@paceline/shared';
import { handleRequest } from './handlers';
import { MAX_HOST_MESSAGE_BYTES, encodeMessage, readOneMessage } from './native/framing';
import type { Paths } from './paths';

/** The browser waits on this; keep each answer fast and finish indexing on later calls. */
export const HOST_BUDGET_MS = 2_500;

export interface HostIO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  paths: Paths;
  now: () => number;
  budgetMs?: number;
}

/** One request in, one response out. Nothing else may ever be written to stdout. */
export async function hostMain(io: HostIO): Promise<void> {
  let response: HostResponse;
  try {
    const raw = await readOneMessage(io.stdin);
    response = await handleRequest(raw, { paths: io.paths, now: io.now, budgetMs: io.budgetMs ?? HOST_BUDGET_MS });
  } catch (e) {
    response = { v: PROTOCOL_VERSION, id: '', ok: false, error: { code: 'BAD_REQUEST', message: e instanceof Error ? e.message : String(e) } };
  }
  let frame = encodeMessage(response);
  if (frame.length > MAX_HOST_MESSAGE_BYTES) {
    frame = encodeMessage({ v: PROTOCOL_VERSION, id: response.id, ok: false, error: { code: 'INTERNAL', message: 'response too large' } });
  }
  await new Promise<void>((resolve, reject) => {
    io.stdout.write(frame, (err) => (err ? reject(err) : resolve()));
  });
}
