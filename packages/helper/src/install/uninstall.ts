import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_NAME } from '@paceline/shared';
import { readConfig } from '../config';
import { browserTargets, windowsManifestPath } from './browsers';
import type { InstallDeps } from './install';
import { isOurStatusLine, readSettings, writeSettings } from './settings';

export function uninstall(d: InstallDeps, opts: { purge: boolean }): { restored: 'previous' | 'removed' | 'untouched'; browsers: string[] } {
  const { paths } = d;
  const config = readConfig(paths);

  let restored: 'previous' | 'removed' | 'untouched' = 'untouched';
  const settings = readSettings(paths.claudeSettings);
  if (settings.exists && isOurStatusLine(settings.data.statusLine)) {
    const next = { ...settings.data };
    if (config?.previousStatusLine) {
      next.statusLine = config.previousStatusLine;
      restored = 'previous';
    } else {
      delete next.statusLine;
      restored = 'removed';
    }
    writeSettings(paths.claudeSettings, next);
  }

  const browsers: string[] = [];
  const targets = browserTargets(d.os, paths.home, d.env);
  if (d.os === 'win32') {
    for (const t of targets) if (t.registryKey) d.registry.remove(t.registryKey);
    rmSync(windowsManifestPath(paths.home, d.env), { force: true });
  } else {
    for (const t of targets) {
      const file = join(t.hostsDir, `${HOST_NAME}.json`);
      if (existsSync(file)) {
        rmSync(file);
        browsers.push(t.name);
      }
    }
  }

  if (opts.purge) rmSync(paths.root, { recursive: true, force: true });
  else if (existsSync(paths.root)) {
    for (const entry of readdirSync(paths.root)) if (entry !== 'backups') rmSync(join(paths.root, entry), { recursive: true, force: true });
  }
  return { restored, browsers };
}
