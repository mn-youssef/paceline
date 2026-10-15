import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_NAME } from '@paceline/shared';
import { readConfig } from './config';
import { readJson } from './fsutil';
import { browserTargets, windowsManifestPath, type OS } from './install/browsers';
import { isOurStatusLine } from './install/settings';
import { readLive } from './live';
import type { Paths } from './paths';
import { loadCache } from './scan';

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

function ago(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function doctor(d: { paths: Paths; os: OS; env: Record<string, string | undefined>; now: number }): Check[] {
  const { paths } = d;
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

  const installed = existsSync(paths.cjs);
  add('helper', installed, installed ? paths.cjs : 'Not installed. Run: npx paceline install');

  const config = readConfig(paths);
  add('node', config !== null && existsSync(config.nodePath), config ? config.nodePath : 'No install record found');

  const targets = browserTargets(d.os, paths.home, d.env);
  const registered =
    d.os === 'win32'
      ? existsSync(windowsManifestPath(paths.home, d.env))
        ? targets.filter((t) => existsSync(t.profileDir)).map((t) => t.name)
        : []
      : targets.filter((t) => existsSync(join(t.hostsDir, `${HOST_NAME}.json`))).map((t) => t.name);
  add('browsers', registered.length > 0, registered.length ? `Registered for ${registered.join(', ')}` : 'No browser registration found');

  const ours = isOurStatusLine(readJson<{ statusLine?: unknown }>(paths.claudeSettings)?.statusLine);
  add('statusline', ours, ours ? `Installed in ${paths.claudeSettings}` : 'The Paceline status line is not set; another tool may have replaced it. Run install again.');

  const live = readLive(paths);
  add(
    'statusline-seen',
    live.lastSeenAt !== null,
    live.lastSeenAt !== null ? `Last ran ${ago(d.now - live.lastSeenAt)}` : 'Claude Code has not run the status line yet. Start a Claude Code session in your terminal.',
  );

  const c = live.capture;
  const windows = c ? [c.fiveHour && `5h ${Math.round(c.fiveHour.usedPct)}%`, c.sevenDay && `7d ${Math.round(c.sevenDay.usedPct)}%`].filter(Boolean) : [];
  add(
    'rate-limits',
    c !== null,
    c ? `${windows.join(' · ')}, captured ${ago(d.now - c.capturedAt)}` : 'No usage limits reported yet. Claude Code reports them for Pro and Max plans after the first response.',
  );

  const hasLogs = existsSync(paths.projectsDir);
  add('logs', hasLogs, hasLogs ? paths.projectsDir : 'No Claude Code session logs found');

  const files = Object.values(loadCache(paths.filesCache).files);
  add('index', true, `${files.length} log files indexed, ${files.reduce((n, f) => n + f.state.malformed, 0)} unreadable lines skipped`);

  if (typeof config?.previousStatusLine?.command === 'string') {
    add('chained', true, `Also running your previous status line: ${config.previousStatusLine.command}`);
  }
  return checks;
}

export function formatChecks(checks: Check[]): string {
  return checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.id.padEnd(16)} ${c.detail}`).join('\n');
}
