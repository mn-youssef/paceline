import { realpathSync } from 'node:fs';
import { KNOWN_EXTENSION_IDS } from '@paceline/shared';
import { doctor, formatChecks } from './doctor';
import { hostMain } from './host';
import type { OS } from './install/browsers';
import { install, type InstallDeps } from './install/install';
import { noRegistry, windowsRegistry } from './install/registry';
import { SettingsParseError } from './install/settings';
import { uninstall } from './install/uninstall';
import { resolvePaths } from './paths';
import { scan } from './scan';
import { statuslineMain } from './statusline';
import { HELPER_VERSION } from './version';

const USAGE = `paceline ${HELPER_VERSION}: local helper for Paceline, the usage meter for Claude Code

Usage:
  npx paceline install [--extension-id <id>]   Connect Claude Code to the extension
  npx paceline doctor [--json]                 Check the connection
  npx paceline uninstall [--purge]             Remove everything and restore your status line

Called by Claude Code and the browser:
  paceline statusline
  paceline host`;

const currentOs = (): OS => (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux');

function flagValues(args: string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    const next = args[i + 1];
    if (a === flag && next) out.push(next);
  });
  return out;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const paths = resolvePaths();
  const os = currentOs();

  // Machine-facing commands first: they must never print anything extra.
  if (cmd === 'host') {
    await hostMain({ stdin: process.stdin, stdout: process.stdout, paths, now: Date.now });
    return 0;
  }
  if (cmd === 'statusline') {
    await statuslineMain(paths);
    return 0;
  }

  const deps: InstallDeps = {
    paths,
    os,
    env: process.env,
    selfPath: realpathSync(process.argv[1] ?? ''),
    nodePath: process.execPath,
    extensionIds: [...KNOWN_EXTENSION_IDS, ...flagValues(rest, '--extension-id')],
    registry: os === 'win32' ? windowsRegistry : noRegistry,
    now: Date.now,
  };

  switch (cmd) {
    case 'install': {
      const r = install(deps);
      console.log(`✓ Helper installed in ${paths.root}`);
      console.log(
        r.browsers.length
          ? `✓ Registered with ${r.browsers.join(', ')}`
          : '! No supported browser profile found (Chrome, Edge, Brave, Arc, Chromium). Install one, then run this again.',
      );
      console.log(`✓ Status line ${r.statusLine === 'already' ? 'already set up' : 'added to ~/.claude/settings.json'}${r.chained ? ` (your previous one still runs: ${r.chained})` : ''}`);
      if (r.backup) console.log(`  Backup of your settings: ${r.backup}`);
      const result = scan({
        paths,
        now: Date.now(),
        onProgress: (done, total) => {
          if (process.stdout.isTTY) process.stdout.write(`\r  Indexing session logs ${done}/${total}`);
        },
      });
      if (process.stdout.isTTY) process.stdout.write('\n');
      console.log(`✓ Indexed ${result.states.length} session logs`);
      console.log('\nDone. Open the Paceline extension: it should say Connected.');
      return 0;
    }
    case 'uninstall': {
      const purge = rest.includes('--purge');
      const r = uninstall(deps, { purge });
      const line = { previous: 'restored to your previous one', removed: 'removed', untouched: 'left unchanged' }[r.restored];
      console.log(`✓ Status line ${line}`);
      console.log(`✓ Unregistered from ${r.browsers.length ? r.browsers.join(', ') : 'all browsers'}`);
      console.log(purge ? `✓ Deleted ${paths.root}` : `✓ Removed helper files (settings backups kept in ${paths.backups})`);
      return 0;
    }
    case 'doctor': {
      const checks = doctor({ paths, os, env: process.env, now: Date.now() });
      console.log(
        rest.includes('--json')
          ? JSON.stringify({ version: HELPER_VERSION, platform: process.platform, node: process.version, checks }, null, 2)
          : formatChecks(checks),
      );
      return checks.some((c) => !c.ok) ? 1 : 0;
    }
    case '--version':
    case '-v':
      console.log(HELPER_VERSION);
      return 0;
    default:
      console.log(USAGE);
      return cmd === undefined || cmd === '--help' || cmd === '-h' ? 0 : 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof SettingsParseError ? `Could not read Claude Code settings (${e.message}). Nothing was changed.` : e);
    process.exitCode = 1;
  },
);
