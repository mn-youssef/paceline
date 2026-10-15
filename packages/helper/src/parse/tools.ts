import type { ToolCategory } from '@paceline/shared';

export function categorize(name: string): ToolCategory {
  if (name.startsWith('mcp__')) return 'mcp';
  switch (name) {
    case 'Read':
    case 'NotebookRead':
      return 'read';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'edit';
    case 'Bash':
    case 'BashOutput':
      return 'bash';
    case 'Grep':
    case 'Glob':
    case 'LS':
      return 'search';
    case 'WebFetch':
    case 'WebSearch':
      return 'web';
    case 'Agent':
    case 'Task':
      return 'agent';
    default:
      return 'other';
  }
}

/** "mcp__<server>__<tool>" → "<server>"; plugin servers "plugin_<plugin>_<name>" → "<name>". */
export function mcpServer(toolName: string): string {
  const server = toolName.split('__')[1] ?? 'unknown';
  const plugin = /^plugin_[^_]+_(.+)$/.exec(server);
  return plugin ? plugin[1]! : server;
}

/** Tools a cheaper model handles just as well; used by the opus-routine tip. */
export const ROUTINE_TOOLS = new Set([
  'Read', 'NotebookRead', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'BashOutput', 'Grep', 'Glob', 'LS',
]);
