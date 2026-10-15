import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const T0 = Date.parse('2026-10-13T08:00:00.000Z');
export const MIN = 60_000;
export const HOUR = 3_600_000;

const iso = (at: number) => new Date(T0 + at).toISOString();
const META = { cwd: '/Users/dev/my-app', sessionId: 's1', entrypoint: 'cli', version: '2.1.296' };

export interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
}

export function assistantLine(o: {
  id: string;
  at: number;
  model?: string;
  usage?: RawUsage;
  tools?: { id: string; name: string; input?: Record<string, unknown> }[];
  sidechain?: boolean;
}): string {
  const content = [
    { type: 'text', text: 'ok' },
    ...(o.tools ?? []).map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input ?? {} })),
  ];
  return JSON.stringify({
    type: 'assistant',
    isSidechain: o.sidechain ?? false,
    ...META,
    timestamp: iso(o.at),
    uuid: `u-${o.id}`,
    message: {
      id: o.id,
      model: o.model ?? 'claude-opus-5-5',
      role: 'assistant',
      content,
      usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...o.usage },
    },
  });
}

export function toolResultLine(o: { at: number; results: { id: string; content: unknown }[]; sidechain?: boolean }): string {
  return JSON.stringify({
    type: 'user',
    isSidechain: o.sidechain ?? false,
    ...META,
    timestamp: iso(o.at),
    message: { role: 'user', content: o.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })) },
  });
}

export function promptLine(o: { at: number; text: string }): string {
  return JSON.stringify({ type: 'user', isSidechain: false, ...META, timestamp: iso(o.at), message: { role: 'user', content: o.text } });
}

export function compactLine(o: { at: number; pre: number; post: number }): string {
  return JSON.stringify({
    type: 'system',
    subtype: 'compact_boundary',
    isSidechain: false,
    ...META,
    timestamp: iso(o.at),
    compactMetadata: { trigger: 'auto', preTokens: o.pre, postTokens: o.post },
  });
}

export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'paceline-test-'));
}

/** Writes ~/.claude/projects/<project>/<sessionId>.jsonl, or …/<sessionId>/subagents/<subagent>.jsonl. */
export function writeLog(home: string, project: string, sessionId: string, lines: string[], subagent?: string): string {
  const dir = subagent
    ? join(home, '.claude', 'projects', project, sessionId, 'subagents')
    : join(home, '.claude', 'projects', project);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${subagent ?? sessionId}.jsonl`);
  writeFileSync(file, lines.map((l) => `${l}\n`).join(''));
  return file;
}
