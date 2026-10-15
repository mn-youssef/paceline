import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditProject } from '../src/analysis/overhead';
import { resolvePaths } from '../src/paths';
import { tempHome } from './fixtures/lines';

describe('auditProject', () => {
  it('collects CLAUDE.md sizes up to home and MCP servers from every config', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    const repo = join(home, 'code', 'mono');
    const pkg = join(repo, 'packages', 'app');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(paths.claudeDir, { recursive: true });
    writeFileSync(join(repo, 'CLAUDE.md'), 'x'.repeat(400));
    writeFileSync(join(pkg, 'CLAUDE.md'), 'x'.repeat(800));
    writeFileSync(join(paths.claudeDir, 'CLAUDE.md'), 'x'.repeat(40));
    writeFileSync(join(pkg, '.mcp.json'), JSON.stringify({ mcpServers: { figma: {}, linear: {} } }));
    const claudeJson = { mcpServers: { github: {} }, projects: { [pkg]: { mcpServers: { figma: {}, sentry: {} } } } };

    const o = auditProject(pkg, paths, claudeJson);
    expect(o.claudeMd.map((f) => [f.path, f.tokens])).toEqual([
      [join(pkg, 'CLAUDE.md'), 200],
      [join(repo, 'CLAUDE.md'), 100],
      [join(paths.claudeDir, 'CLAUDE.md'), 10],
    ]);
    expect(o.claudeMdTokens).toBe(310);
    expect(o.mcpServers).toEqual(['figma', 'github', 'linear', 'sentry']);
  });

  it('returns an empty audit for a project that no longer exists', () => {
    const home = tempHome();
    expect(auditProject(join(home, 'gone'), resolvePaths(home), null)).toEqual({ claudeMd: [], claudeMdTokens: 0, mcpServers: [] });
  });
});
