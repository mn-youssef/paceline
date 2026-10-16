import type { Usage } from '@paceline/shared';
import { applyEvent, finalize, newAccState, type AccState } from '../../src/parse/accumulator';
import type { LogEvent, ToolCall } from '../../src/parse/line';
import { T0 } from './lines';

export { T0 };
export const SEC = 1_000;
export const MIN = 60_000;

const base = { cwd: '/Users/dev/my-app', entrypoint: 'cli' };

export const call = (id: string, name: string, filePath: string | null = null, skill: string | null = null): ToolCall => ({ id, name, filePath, skill });

export function turn(o: { id: string; at: number; model?: string; usage?: Partial<Usage>; tools?: ToolCall[]; sidechain?: boolean }): LogEvent {
  return {
    ...base,
    kind: 'assistant',
    ts: T0 + o.at,
    sidechain: o.sidechain ?? false,
    messageId: o.id,
    model: o.model ?? 'claude-opus-5-5',
    usage: { input: 10, output: 100, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...o.usage },
    tools: o.tools ?? [],
  };
}

export function results(at: number, pairs: [toolUseId: string, tokens: number][], sidechain = false): LogEvent {
  return { ...base, kind: 'user', ts: T0 + at, sidechain, results: pairs.map(([toolUseId, tokens]) => ({ toolUseId, tokens })), command: null, skillText: null };
}

export function skillText(at: number, toolUseId: string, tokens: number): LogEvent {
  return { ...base, kind: 'user', ts: T0 + at, sidechain: false, results: [], command: null, skillText: { toolUseId, tokens } };
}

export function compact(at: number): LogEvent {
  return { ...base, kind: 'compact', ts: T0 + at, sidechain: false, preTokens: 900_000, postTokens: 20_000 };
}

export function run(events: LogEvent[], o: { sessionId?: string; subagent?: boolean } = {}): AccState {
  const s = newAccState(o.sessionId ?? 's1', o.subagent ?? false);
  for (const e of events) applyEvent(s, e);
  return finalize(s);
}
