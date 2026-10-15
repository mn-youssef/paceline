import { describe, expect, it } from 'vitest';
import { categorize, mcpServer, ROUTINE_TOOLS } from '../src/parse/tools';

describe('categorize', () => {
  it('maps built-in tools to categories', () => {
    expect(['Read', 'Edit', 'Bash', 'Grep', 'WebFetch', 'Agent', 'TodoWrite'].map(categorize)).toEqual([
      'read', 'edit', 'bash', 'search', 'web', 'agent', 'other',
    ]);
  });

  it('puts every mcp__ tool in the mcp category', () => {
    expect(categorize('mcp__figma__get_design')).toBe('mcp');
  });
});

describe('mcpServer', () => {
  it('extracts the server name, unwrapping plugin-provided servers', () => {
    expect(mcpServer('mcp__figma__get_design')).toBe('figma');
    expect(mcpServer('mcp__claude-in-chrome__computer')).toBe('claude-in-chrome');
    expect(mcpServer('mcp__plugin_chrome-devtools-mcp_chrome-devtools__click')).toBe('chrome-devtools');
  });
});

describe('ROUTINE_TOOLS', () => {
  it('covers reading, editing, shell and search only', () => {
    expect(ROUTINE_TOOLS.has('Edit')).toBe(true);
    expect(ROUTINE_TOOLS.has('WebFetch')).toBe(false);
    expect(ROUTINE_TOOLS.has('Agent')).toBe(false);
  });
});
