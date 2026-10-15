import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

export const CHUNK_BYTES = 8 * 1024 * 1024;

export interface ReadChunk {
  lines: string[];
  nextOffset: number;
  eof: boolean;
}

/**
 * Reads complete lines starting at a byte offset. A trailing line without "\n" is left for the
 * next call (Claude Code may still be writing it). Lines longer than the chunk grow the read.
 */
export function readLinesFrom(path: string, offset: number, chunkBytes = CHUNK_BYTES): ReadChunk {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    if (offset >= size) return { lines: [], nextOffset: offset, eof: true };
    let want = Math.min(chunkBytes, size - offset);
    for (;;) {
      const buf = Buffer.allocUnsafe(want);
      const n = readSync(fd, buf, 0, want, offset);
      const view = buf.subarray(0, n);
      const lastNl = view.lastIndexOf(0x0a);
      const reachedEnd = n < want || offset + n >= size;
      if (lastNl === -1) {
        if (reachedEnd) return { lines: [], nextOffset: offset, eof: true };
        want = Math.min(want * 2, size - offset);
        continue;
      }
      const lines = view
        .subarray(0, lastNl)
        .toString('utf8')
        .split('\n')
        .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
        .filter((l) => l.length > 0);
      const nextOffset = offset + lastNl + 1;
      return { lines, nextOffset, eof: nextOffset >= size };
    }
  } finally {
    closeSync(fd);
  }
}
