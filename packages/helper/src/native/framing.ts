/** Chrome caps host → browser messages at 1 MB. */
export const MAX_HOST_MESSAGE_BYTES = 1024 * 1024;

export function encodeMessage(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export function decodeMessage(buf: Buffer): { message: unknown; rest: Buffer } | null {
  if (buf.length < 4) return null;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return null;
  return { message: JSON.parse(buf.subarray(4, 4 + len).toString('utf8')), rest: buf.subarray(4 + len) };
}

export async function readOneMessage(stream: NodeJS.ReadableStream): Promise<unknown> {
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    const decoded = decodeMessage(buf);
    if (decoded) return decoded.message;
  }
  throw new Error('stdin closed before a full message arrived');
}
