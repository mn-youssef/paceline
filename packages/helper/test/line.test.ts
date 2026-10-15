import { describe, expect, it } from 'vitest';
import { estimateTokens, parseLine } from '../src/parse/line';
import { T0, assistantLine, compactLine, promptLine, toolResultLine } from './fixtures/lines';

describe('parseLine', () => {
  it('reads usage, model and tool calls from an assistant line', () => {
    const ev = parseLine(
      assistantLine({
        id: 'm1',
        at: 0,
        usage: {
          input_tokens: 2,
          output_tokens: 336,
          cache_read_input_tokens: 40_862,
          cache_creation_input_tokens: 37_367,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 37_367 },
        },
        tools: [
          { id: 't1', name: 'Read', input: { file_path: '/repo/a.ts' } },
          { id: 't2', name: 'Bash', input: { command: 'ls' } },
        ],
      }),
    );
    expect(ev).toEqual({
      kind: 'assistant',
      ts: T0,
      sidechain: false,
      cwd: '/Users/dev/my-app',
      entrypoint: 'cli',
      messageId: 'm1',
      model: 'claude-opus-5-5',
      usage: { input: 2, output: 336, cacheRead: 40_862, cacheWrite5m: 0, cacheWrite1h: 37_367 },
      tools: [
        { id: 't1', name: 'Read', filePath: '/repo/a.ts' },
        { id: 't2', name: 'Bash', filePath: null },
      ],
    });
  });

  it('counts cache writes without a TTL split as 5-minute writes', () => {
    const ev = parseLine(assistantLine({ id: 'm1', at: 0, usage: { cache_creation_input_tokens: 900 } }));
    expect(ev).toMatchObject({ usage: { cacheWrite5m: 900, cacheWrite1h: 0 } });
  });

  it('skips synthetic assistant messages', () => {
    expect(parseLine(assistantLine({ id: 'm1', at: 0, model: '<synthetic>' }))).toBeNull();
  });

  it('estimates tool result sizes', () => {
    const ev = parseLine(
      toolResultLine({
        at: 1_000,
        results: [
          { id: 't1', content: 'x'.repeat(400) },
          { id: 't2', content: [{ type: 'image', source: {} }, { type: 'text', text: 'y'.repeat(40) }] },
        ],
      }),
    );
    expect(ev).toMatchObject({
      kind: 'user',
      ts: T0 + 1_000,
      results: [
        { toolUseId: 't1', tokens: 100 },
        { toolUseId: 't2', tokens: 1_610 },
      ],
      command: null,
    });
  });

  it('detects slash commands', () => {
    expect(parseLine(promptLine({ at: 0, text: '<command-name>/clear</command-name>' }))).toMatchObject({ kind: 'user', command: '/clear' });
  });

  it('reads compaction markers', () => {
    expect(parseLine(compactLine({ at: 5_000, pre: 968_354, post: 22_286 }))).toMatchObject({
      kind: 'compact',
      ts: T0 + 5_000,
      preTokens: 968_354,
      postTokens: 22_286,
    });
  });

  it('flags broken JSON and ignores other line types', () => {
    expect(parseLine('{"type":"assistant", oops')).toEqual({ kind: 'malformed' });
    expect(parseLine(JSON.stringify({ type: 'attachment', foo: 1 }))).toBeNull();
  });
});

describe('estimateTokens', () => {
  it('handles missing and unknown shapes', () => {
    expect(estimateTokens(undefined)).toBe(0);
    const ref = { type: 'tool_reference', name: 'x' };
    expect(estimateTokens([ref])).toBe(Math.ceil(JSON.stringify(ref).length / 4));
  });
});
