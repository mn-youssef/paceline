import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { HOST_NAME } from '@paceline/shared';
import { readConfig, type PacelineConfig, type StatusLineSetting } from '../config';
import { writeJsonAtomic } from '../fsutil';
import type { Paths } from '../paths';
import { HELPER_VERSION } from '../version';
import { browserTargets, windowsManifestPath, type OS } from './browsers';
import type { Registry } from './registry';
import { isOurStatusLine, readSettings, statusLineCommand, writeSettings } from './settings';

export interface InstallDeps {
  paths: Paths;
  os: OS;
  env: Record<string, string | undefined>;
  selfPath: string;
  nodePath: string;
  extensionIds: string[];
  registry: Registry;
  now: () => number;
}

export interface InstallReport {
  browsers: string[];
  statusLine: 'installed' | 'already';
  chained: string | null;
  backup: string | null;
}

export function hostManifest(launcher: string, ids: string[]) {
  return {
    name: HOST_NAME,
    description: 'Paceline local helper',
    path: launcher,
    type: 'stdio',
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
  };
}

export const posixLauncher = (node: string, cjs: string) => `#!/bin/sh\nexec "${node}" "${cjs}" host "$@"\n`;
export const windowsLauncher = (node: string, cjs: string) => `@echo off\r\n"${node}" "${cjs}" host %*\r\n`;
export const launcherPath = (paths: Paths, os: OS) => join(paths.bin, os === 'win32' ? 'paceline-host.bat' : 'paceline-host');

export function install(d: InstallDeps): InstallReport {
  const { paths } = d;
  // Parse settings first: if they are broken, stop before writing anything.
  const settings = readSettings(paths.claudeSettings);

  for (const dir of [paths.root, paths.bin, paths.cacheDir, paths.backups, paths.logs]) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (resolve(d.selfPath) !== resolve(paths.cjs)) copyFileSync(d.selfPath, paths.cjs);

  const launcher = launcherPath(paths, d.os);
  writeFileSync(launcher, d.os === 'win32' ? windowsLauncher(d.nodePath, paths.cjs) : posixLauncher(d.nodePath, paths.cjs), { mode: 0o755 });
  if (d.os !== 'win32') chmodSync(launcher, 0o755);

  const manifest = `${JSON.stringify(hostManifest(launcher, d.extensionIds), null, 2)}\n`;
  const browsers: string[] = [];
  const targets = browserTargets(d.os, paths.home, d.env);
  if (d.os === 'win32') {
    const manifestPath = windowsManifestPath(paths.home, d.env);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, manifest);
    for (const t of targets) {
      if (!existsSync(t.profileDir) || !t.registryKey) continue;
      d.registry.set(t.registryKey, manifestPath);
      browsers.push(t.name);
    }
  } else {
    for (const t of targets) {
      if (!existsSync(t.profileDir)) continue;
      mkdirSync(t.hostsDir, { recursive: true });
      writeFileSync(join(t.hostsDir, `${HOST_NAME}.json`), manifest);
      browsers.push(t.name);
    }
  }

  const current = settings.data.statusLine as StatusLineSetting | undefined;
  const already = isOurStatusLine(current);
  const previous: StatusLineSetting | null = already ? (readConfig(paths)?.previousStatusLine ?? null) : (current ?? null);
  let backup: string | null = null;
  if (!already && settings.exists) {
    backup = join(paths.backups, `settings.${new Date(d.now()).toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(backup, settings.raw ?? '', { mode: 0o600 });
  }
  const ours: StatusLineSetting = { type: 'command', command: statusLineCommand(d.nodePath, paths.cjs) };
  if (typeof previous?.padding === 'number') ours.padding = previous.padding;
  mkdirSync(dirname(paths.claudeSettings), { recursive: true });
  writeSettings(paths.claudeSettings, { ...settings.data, statusLine: ours });

  const config: PacelineConfig = {
    version: HELPER_VERSION,
    installedAt: d.now(),
    previousStatusLine: previous,
    extensionIds: d.extensionIds,
    nodePath: d.nodePath,
  };
  writeJsonAtomic(paths.config, config);

  return {
    browsers,
    statusLine: already ? 'already' : 'installed',
    chained: typeof previous?.command === 'string' ? previous.command : null,
    backup,
  };
}
