import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Paths {
  home: string;
  claudeDir: string;
  projectsDir: string;
  claudeSettings: string;
  claudeJson: string;
  root: string;
  bin: string;
  cjs: string;
  config: string;
  live: string;
  cacheDir: string;
  filesCache: string;
  lock: string;
  backups: string;
  logs: string;
}

/** `claudeConfigDir` is Claude Code's CLAUDE_CONFIG_DIR; it moves settings, projects and .claude.json. */
export function resolvePaths(home: string = homedir(), claudeConfigDir?: string): Paths {
  const claudeDir = claudeConfigDir ?? join(home, '.claude');
  const root = join(home, '.paceline');
  const cacheDir = join(root, 'cache');
  return {
    home,
    claudeDir,
    projectsDir: join(claudeDir, 'projects'),
    claudeSettings: join(claudeDir, 'settings.json'),
    claudeJson: claudeConfigDir ? join(claudeConfigDir, '.claude.json') : join(home, '.claude.json'),
    root,
    bin: join(root, 'bin'),
    cjs: join(root, 'paceline.cjs'),
    config: join(root, 'config.json'),
    live: join(root, 'live.json'),
    cacheDir,
    filesCache: join(cacheDir, 'files.json'),
    lock: join(cacheDir, 'scan.lock'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
  };
}
