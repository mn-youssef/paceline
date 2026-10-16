import type { Usage } from '@paceline/shared';

export interface ToolCall {
  id: string;
  name: string;
  filePath: string | null;
  /** The skill a Skill call loads. */
  skill: string | null;
}

interface EventBase {
  ts: number | null;
  sidechain: boolean;
  cwd: string | null;
  entrypoint: string | null;
}

export interface AssistantEvent extends EventBase {
  kind: 'assistant';
  messageId: string;
  model: string;
  usage: Usage | null;
  tools: ToolCall[];
}

export interface UserEvent extends EventBase {
  kind: 'user';
  results: { toolUseId: string; tokens: number }[];
  command: string | null;
  /** The text of a loaded skill, which Claude Code writes as a separate message linked to the Skill call. */
  skillText: { toolUseId: string; tokens: number } | null;
}

export interface CompactEvent extends EventBase {
  kind: 'compact';
  preTokens: number;
  postTokens: number;
}

export type LogEvent = AssistantEvent | UserEvent | CompactEvent | { kind: 'malformed' };

export const IMAGE_TOKENS = 1_600;

// Cheap substring test before JSON.parse: most lines (attachments, snapshots) are irrelevant.
const MARKERS = ['"type":"assistant"', '"type":"user"', '"compact_boundary"'];
const COMMAND = /<command-name>(\/[\w:-]+)<\/command-name>/;

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

export function parseLine(line: string): LogEvent | null {
  if (!MARKERS.some((m) => line.includes(m))) return null;
  let d: unknown;
  try {
    d = JSON.parse(line);
  } catch {
    return { kind: 'malformed' };
  }
  if (!isObj(d)) return { kind: 'malformed' };
  const ts = typeof d.timestamp === 'string' ? Date.parse(d.timestamp) : Number.NaN;
  const base: EventBase = {
    ts: Number.isFinite(ts) ? ts : null,
    sidechain: d.isSidechain === true,
    cwd: str(d.cwd),
    entrypoint: str(d.entrypoint),
  };
  if (d.type === 'assistant') return parseAssistant(d, base);
  if (d.type === 'user') return parseUser(d, base);
  if (d.type === 'system' && d.subtype === 'compact_boundary') {
    const meta = isObj(d.compactMetadata) ? d.compactMetadata : {};
    return { ...base, kind: 'compact', preTokens: num(meta.preTokens), postTokens: num(meta.postTokens) };
  }
  return null;
}

function parseAssistant(d: Json, base: EventBase): AssistantEvent | null {
  const m = d.message;
  if (!isObj(m)) return null;
  const model = str(m.model) ?? 'unknown';
  if (model === '<synthetic>') return null;
  const tools: ToolCall[] = [];
  if (Array.isArray(m.content)) {
    for (const b of m.content) {
      if (!isObj(b) || b.type !== 'tool_use' || typeof b.id !== 'string' || typeof b.name !== 'string') continue;
      const input = isObj(b.input) ? b.input : {};
      tools.push({
        id: b.id,
        name: b.name,
        filePath: str(input.file_path) ?? str(input.notebook_path),
        skill: b.name === 'Skill' ? str(input.skill) : null,
      });
    }
  }
  return {
    ...base,
    kind: 'assistant',
    messageId: str(m.id) ?? str(d.uuid) ?? String(base.ts ?? 0),
    model,
    usage: isObj(m.usage) ? toUsage(m.usage) : null,
    tools,
  };
}

export function toUsage(u: Json): Usage {
  const total = num(u.cache_creation_input_tokens);
  const split = isObj(u.cache_creation) ? u.cache_creation : null;
  const w1h = split ? num(split.ephemeral_1h_input_tokens) : 0;
  const w5m = split ? num(split.ephemeral_5m_input_tokens) : 0;
  // Older logs have no TTL split: count everything (and any remainder) as 5-minute writes.
  const rest = Math.max(0, total - w1h - w5m);
  return {
    input: num(u.input_tokens),
    output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens),
    cacheWrite5m: w5m + rest,
    cacheWrite1h: w1h,
  };
}

function parseUser(d: Json, base: EventBase): UserEvent {
  const content = isObj(d.message) ? d.message.content : undefined;
  const results: UserEvent['results'] = [];
  const texts: string[] = [];
  if (typeof content === 'string') texts.push(content);
  else if (Array.isArray(content)) {
    for (const b of content) {
      if (!isObj(b)) continue;
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        results.push({ toolUseId: b.tool_use_id, tokens: estimateTokens(b.content) });
      } else if (b.type === 'text' && typeof b.text === 'string') {
        texts.push(b.text);
      }
    }
  }
  const match = texts.map((t) => COMMAND.exec(t)).find((m) => m !== null);
  const skillText = d.isMeta === true && typeof d.sourceToolUseID === 'string' ? { toolUseId: d.sourceToolUseID, tokens: estimateTokens(content) } : null;
  return { ...base, kind: 'user', results, command: match ? match[1]! : null, skillText };
}

/** ~4 characters per token for text; a flat estimate per image. */
export function estimateTokens(content: unknown): number {
  if (typeof content === 'string') return Math.ceil(content.length / 4);
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const b of content) {
    if (isObj(b) && b.type === 'image') total += IMAGE_TOKENS;
    else if (isObj(b) && b.type === 'text' && typeof b.text === 'string') total += Math.ceil(b.text.length / 4);
    else total += Math.ceil(JSON.stringify(b ?? '').length / 4);
  }
  return total;
}
