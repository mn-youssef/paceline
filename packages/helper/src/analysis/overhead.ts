import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readJson } from '../fsutil';
import type { Paths } from '../paths';

export interface ProjectOverhead {
  claudeMd: { path: string; tokens: number }[];
  claudeMdTokens: number;
  mcpServers: string[];
}

const MAX_LEVELS = 12;

export function auditProject(cwd: string, paths: Paths, claudeJson: unknown): ProjectOverhead {
  const claudeMd: ProjectOverhead['claudeMd'] = [];
  const seen = new Set<string>();
  const consider = (p: string) => {
    if (seen.has(p)) return;
    seen.add(p);
    try {
      const st = statSync(p);
      if (st.isFile()) claudeMd.push({ path: p, tokens: Math.ceil(st.size / 4) });
    } catch {
      // Not present.
    }
  };

  // Claude Code loads CLAUDE.md from the working directory and every parent up to home.
  let dir = resolve(cwd);
  for (let i = 0; i < MAX_LEVELS; i++) {
    consider(join(dir, 'CLAUDE.md'));
    consider(join(dir, 'CLAUDE.local.md'));
    consider(join(dir, '.claude', 'CLAUDE.md'));
    if (dir === paths.home) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  consider(join(paths.claudeDir, 'CLAUDE.md'));

  const servers = new Set<string>();
  const local = readJson<{ mcpServers?: Record<string, unknown> }>(join(cwd, '.mcp.json'));
  for (const name of Object.keys(local?.mcpServers ?? {})) servers.add(name);
  const cj = (claudeJson ?? {}) as {
    mcpServers?: Record<string, unknown>;
    projects?: Record<string, { mcpServers?: Record<string, unknown> } | undefined>;
  };
  for (const name of Object.keys(cj.mcpServers ?? {})) servers.add(name);
  for (const name of Object.keys(cj.projects?.[cwd]?.mcpServers ?? {})) servers.add(name);

  return { claudeMd, claudeMdTokens: claudeMd.reduce((s, f) => s + f.tokens, 0), mcpServers: [...servers].sort() };
}
