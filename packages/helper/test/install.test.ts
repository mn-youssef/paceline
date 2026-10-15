import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOST_NAME } from '@paceline/shared';
import { readConfig } from '../src/config';
import { browserTargets, windowsManifestPath } from '../src/install/browsers';
import { install, posixLauncher, windowsLauncher, type InstallDeps } from '../src/install/install';
import { noRegistry } from '../src/install/registry';
import { SettingsParseError } from '../src/install/settings';
import { uninstall } from '../src/install/uninstall';
import { resolvePaths } from '../src/paths';
import { tempHome } from './fixtures/lines';

const CHROME = ['Library', 'Application Support', 'Google', 'Chrome'];
const BRAVE = ['Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'];
const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';

function setup(o: { settings?: unknown; browsers?: string[][] } = {}) {
  const home = tempHome();
  const paths = resolvePaths(home);
  for (const b of o.browsers ?? [CHROME]) mkdirSync(join(home, ...b), { recursive: true });
  if (o.settings !== undefined) {
    mkdirSync(paths.claudeDir, { recursive: true });
    writeFileSync(paths.claudeSettings, typeof o.settings === 'string' ? o.settings : JSON.stringify(o.settings));
  }
  const self = join(home, 'npx-cache', 'paceline.cjs');
  mkdirSync(join(home, 'npx-cache'));
  writeFileSync(self, '// bundle');
  const deps: InstallDeps = {
    paths,
    os: 'darwin',
    env: {},
    selfPath: self,
    nodePath: '/usr/local/bin/node',
    extensionIds: [EXT_ID],
    registry: noRegistry,
    now: () => Date.UTC(2026, 9, 13),
  };
  return { home, paths, deps };
}

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('install', () => {
  it('copies the helper, writes a launcher and registers detected browsers only', () => {
    const { home, paths, deps } = setup({ browsers: [CHROME, BRAVE] });
    const report = install(deps);
    expect(readFileSync(paths.cjs, 'utf8')).toBe('// bundle');
    const launcher = join(paths.bin, 'paceline-host');
    expect(readFileSync(launcher, 'utf8')).toBe(posixLauncher('/usr/local/bin/node', paths.cjs));
    expect(statSync(launcher).mode & 0o111).not.toBe(0);
    expect(report.browsers).toEqual(['Chrome', 'Brave']);
    expect(json(join(home, ...CHROME, 'NativeMessagingHosts', `${HOST_NAME}.json`))).toEqual({
      name: HOST_NAME,
      description: 'Paceline local helper',
      path: launcher,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXT_ID}/`],
    });
  });

  it('installs its status line and backs up the settings file', () => {
    const { paths, deps } = setup({ settings: { model: 'opus' } });
    const report = install(deps);
    expect(json(paths.claudeSettings)).toEqual({
      model: 'opus',
      statusLine: { type: 'command', command: `"/usr/local/bin/node" "${paths.cjs}" statusline` },
    });
    expect(report.backup).not.toBeNull();
    expect(json(report.backup!)).toEqual({ model: 'opus' });
  });

  it('chains an existing status line and keeps its padding', () => {
    const custom = { type: 'command', command: '~/bin/my-line.sh', padding: 2 };
    const { paths, deps } = setup({ settings: { statusLine: custom } });
    expect(install(deps).chained).toBe('~/bin/my-line.sh');
    expect(json(paths.claudeSettings).statusLine).toMatchObject({ type: 'command', padding: 2 });
    expect(readConfig(paths)?.previousStatusLine).toEqual(custom);
  });

  it('is safe to run twice', () => {
    const custom = { type: 'command', command: '~/bin/my-line.sh' };
    const { paths, deps } = setup({ settings: { statusLine: custom } });
    install(deps);
    const second = install(deps);
    expect(second).toMatchObject({ statusLine: 'already', backup: null, chained: '~/bin/my-line.sh' });
    expect(readConfig(paths)?.previousStatusLine).toEqual(custom);
  });

  it('writes through a symlinked settings.json and leaves the link in place', () => {
    const { home, paths, deps } = setup();
    const dotfile = join(home, 'dotfiles', 'claude-settings.json');
    mkdirSync(dirname(dotfile), { recursive: true });
    mkdirSync(paths.claudeDir, { recursive: true });
    writeFileSync(dotfile, JSON.stringify({ model: 'opus' }));
    symlinkSync(dotfile, paths.claudeSettings);
    install(deps);
    expect(lstatSync(paths.claudeSettings).isSymbolicLink()).toBe(true);
    expect(json(dotfile).statusLine.command).toContain('statusline');
    uninstall(deps, { purge: false });
    expect(lstatSync(paths.claudeSettings).isSymbolicLink()).toBe(true);
    expect(json(dotfile)).toEqual({ model: 'opus' });
  });

  it('refuses to touch anything when settings.json is not valid JSON', () => {
    const { paths, deps } = setup({ settings: '{ "model": "opus", }' });
    expect(() => install(deps)).toThrow(SettingsParseError);
    expect(existsSync(paths.root)).toBe(false);
    expect(readFileSync(paths.claudeSettings, 'utf8')).toBe('{ "model": "opus", }');
  });

  it('registers Linux browsers under ~/.config', () => {
    const { home, deps } = setup({ browsers: [['.config', 'google-chrome']] });
    expect(install({ ...deps, os: 'linux' }).browsers).toEqual(['Chrome']);
    expect(existsSync(join(home, '.config', 'google-chrome', 'NativeMessagingHosts', `${HOST_NAME}.json`))).toBe(true);
  });

  it('registers Vivaldi on Linux and macOS', () => {
    const linux = setup({ browsers: [['.config', 'vivaldi']] });
    expect(install({ ...linux.deps, os: 'linux' }).browsers).toEqual(['Vivaldi']);
    expect(existsSync(join(linux.home, '.config', 'vivaldi', 'NativeMessagingHosts', `${HOST_NAME}.json`))).toBe(true);
    const mac = setup({ browsers: [['Library', 'Application Support', 'Vivaldi']] });
    expect(install(mac.deps).browsers).toEqual(['Vivaldi']);
  });

  it('records CLAUDE_CONFIG_DIR so the browser-launched host finds it', () => {
    const { home, deps } = setup();
    const dir = join(home, 'claude-work');
    const paths = resolvePaths(home, dir);
    install({ ...deps, paths, env: { CLAUDE_CONFIG_DIR: dir } });
    expect(readConfig(paths)?.claudeDir).toBe(dir);
    expect(json(join(dir, 'settings.json')).statusLine.command).toContain('statusline');
  });

  it('records no config dir when CLAUDE_CONFIG_DIR is unset', () => {
    const { paths, deps } = setup();
    install(deps);
    expect(readConfig(paths)?.claudeDir).toBeUndefined();
  });
});

describe('resolvePaths', () => {
  it('uses ~/.claude and ~/.claude.json by default', () => {
    expect(resolvePaths('/home/me')).toMatchObject({
      claudeDir: '/home/me/.claude',
      projectsDir: '/home/me/.claude/projects',
      claudeJson: '/home/me/.claude.json',
    });
  });

  it('moves everything into CLAUDE_CONFIG_DIR, but keeps its own files in ~/.paceline', () => {
    expect(resolvePaths('/home/me', '/data/claude')).toMatchObject({
      claudeDir: '/data/claude',
      projectsDir: '/data/claude/projects',
      claudeSettings: '/data/claude/settings.json',
      claudeJson: '/data/claude/.claude.json',
      root: '/home/me/.paceline',
    });
  });
});

describe('uninstall', () => {
  it('restores the previous status line exactly and removes registrations', () => {
    const custom = { type: 'command', command: '~/bin/my-line.sh', padding: 2 };
    const { home, paths, deps } = setup({ settings: { model: 'opus', statusLine: custom } });
    install(deps);
    expect(uninstall(deps, { purge: false })).toEqual({ restored: 'previous', browsers: ['Chrome'] });
    expect(json(paths.claudeSettings)).toEqual({ model: 'opus', statusLine: custom });
    expect(existsSync(join(home, ...CHROME, 'NativeMessagingHosts', `${HOST_NAME}.json`))).toBe(false);
    expect(existsSync(paths.cjs)).toBe(false);
    expect(existsSync(paths.backups)).toBe(true);
  });

  it('removes the status line when there was none before, and purges on request', () => {
    const { paths, deps } = setup({ settings: { model: 'opus' } });
    install(deps);
    expect(uninstall(deps, { purge: true }).restored).toBe('removed');
    expect(json(paths.claudeSettings)).toEqual({ model: 'opus' });
    expect(existsSync(paths.root)).toBe(false);
  });
});

describe('Windows layout', () => {
  it('uses one manifest and per-browser registry keys', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
    expect(windowsManifestPath('C:\\Users\\me', env)).toBe('C:\\Users\\me\\AppData\\Local\\paceline\\com.paceline.host.json');
    const targets = browserTargets('win32', 'C:\\Users\\me', env);
    expect(targets.map((t) => t.registryKey)).toEqual([
      'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.paceline.host',
      'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.paceline.host',
      'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.paceline.host',
    ]);
    expect(targets[0]!.profileDir).toBe('C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\User Data');
  });

  it('writes a batch launcher', () => {
    expect(windowsLauncher('C:\\node.exe', 'C:\\Users\\me\\.paceline\\paceline.cjs')).toBe(
      '@echo off\r\n"C:\\node.exe" "C:\\Users\\me\\.paceline\\paceline.cjs" host %*\r\n',
    );
  });
});
