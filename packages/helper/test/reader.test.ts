import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLinesFrom } from '../src/parse/reader';
import { tempHome } from './fixtures/lines';

const file = (content: string) => {
  const p = join(tempHome(), 'log.jsonl');
  writeFileSync(p, content);
  return p;
};

describe('readLinesFrom', () => {
  it('returns complete lines and leaves a partial last line for later', () => {
    const p = file('a\nb\nc');
    expect(readLinesFrom(p, 0)).toEqual({ lines: ['a', 'b'], nextOffset: 4, eof: false });
    expect(readLinesFrom(p, 4)).toEqual({ lines: [], nextOffset: 4, eof: true });
    appendFileSync(p, '\n');
    expect(readLinesFrom(p, 4)).toEqual({ lines: ['c'], nextOffset: 6, eof: true });
  });

  it('stops at the chunk size on a line boundary', () => {
    const p = file('xxxxxxxxxx\n'.repeat(5));
    expect(readLinesFrom(p, 0, 25)).toEqual({ lines: ['xxxxxxxxxx', 'xxxxxxxxxx'], nextOffset: 22, eof: false });
  });

  it('grows the read for a line longer than the chunk', () => {
    const p = file(`${'y'.repeat(100)}\nz\n`);
    const r = readLinesFrom(p, 0, 16);
    expect(r.lines).toEqual(['y'.repeat(100), 'z']);
    expect(r.eof).toBe(true);
  });

  it('never splits a multi-byte character', () => {
    const p = file(`${'é'.repeat(10)}\n`);
    expect(readLinesFrom(p, 0, 7).lines).toEqual(['é'.repeat(10)]);
  });
});
