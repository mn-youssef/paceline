import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeMessage, encodeMessage } from '../src/native/framing';
import { tempHome } from './fixtures/lines';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(PKG, 'dist', 'paceline.cjs');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version as string;

// Every path the helper writes stays inside the temporary home, on Windows too (LOCALAPPDATA holds its manifest).
const homeEnv = (home: string) => ({ ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local') });
const chromeProfile = (home: string) =>
  process.platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    : process.platform === 'win32'
      ? join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
      : join(home, '.config', 'google-chrome');
const hostManifest = (home: string) =>
  process.platform === 'win32' ? join(home, 'AppData', 'Local', 'paceline', 'com.paceline.host.json') : join(chromeProfile(home), 'NativeMessagingHosts', 'com.paceline.host.json');
// Installing on Windows writes the registry (HKCU), so those tests only run on CI machines there.
const realRegistry = process.platform === 'win32' && process.env.CI !== 'true';

const run = (home: string, args: string[], input?: string | Buffer) => spawnSync(process.execPath, [BIN, ...args], { env: homeEnv(home), input });

beforeAll(() => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: PKG, stdio: 'ignore' });
}, 60_000);

describe('bundled CLI', () => {
  it('prints its version', () => {
    expect(run(tempHome(), ['--version']).stdout.toString().trim()).toBe(VERSION);
  });

  it('answers a framed ping as a native host', () => {
    const r = run(tempHome(), ['host', 'chrome-extension://abc/'], encodeMessage({ v: 1, id: 'p', type: 'ping' }));
    expect(decodeMessage(r.stdout)?.message).toMatchObject({ v: 1, id: 'p', ok: true, data: { helperVersion: VERSION } });
  });

  it.skipIf(realRegistry)('installs, records a status line update, and uninstalls', () => {
    const home = tempHome();
    mkdirSync(chromeProfile(home), { recursive: true });
    expect(run(home, ['install']).status).toBe(0);
    const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    expect(settings.statusLine.command).toContain(join(home, '.paceline', 'paceline.cjs'));

    const status = run(
      home,
      ['statusline'],
      JSON.stringify({ rate_limits: { five_hour: { used_percentage: 42, resets_at: 1_790_000_000 }, seven_day: { used_percentage: 18, resets_at: 1_790_500_000 } } }),
    );
    expect(status.stdout.toString()).toBe('5h 42% · 7d 18%');

    const report = JSON.parse(run(home, ['doctor', '--json']).stdout.toString());
    expect(report.checks.find((c: { id: string }) => c.id === 'rate-limits').ok).toBe(true);

    expect(run(home, ['uninstall']).status).toBe(0);
    expect(JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).statusLine).toBeUndefined();
  });
});

describe('release build', () => {
  const STORE = 'abcdefghijklmnopabcdefghijklmnop';
  // Each test gets its own IDs file and output, so the repo's extension-ids.json and release/ never matter.
  const buildRelease = (store: string | null, env: NodeJS.ProcessEnv = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'paceline-release-'));
    const ids = join(dir, 'extension-ids.json');
    writeFileSync(ids, JSON.stringify({ dev: 'cchmkmfoocjlfkogepngoklnehiofpco', store }));
    const outfile = join(dir, 'paceline.cjs');
    const base = { ...process.env };
    delete base.PACELINE_STORE_ID;
    const r = spawnSync(process.execPath, ['build.mjs', '--release', '--ids', ids, '--outfile', outfile], { cwd: PKG, env: { ...base, ...env }, encoding: 'utf8' });
    return { ...r, outfile };
  };

  it.skipIf(realRegistry)(
    'release build trusts only the store ID and leaves the development build untouched',
    () => {
      const devBuilt = statSync(BIN).mtimeMs;
      const releaseFolder = join(PKG, 'release', 'paceline.cjs');
      const releaseBefore = existsSync(releaseFolder) ? statSync(releaseFolder).mtimeMs : null;
      const r = buildRelease(STORE);
      expect(r.status).toBe(0);
      const home = tempHome();
      mkdirSync(chromeProfile(home), { recursive: true });
      expect(spawnSync(process.execPath, [r.outfile, 'install'], { env: homeEnv(home) }).status).toBe(0);
      const manifest = JSON.parse(readFileSync(hostManifest(home), 'utf8'));
      expect(manifest.allowed_origins).toEqual([`chrome-extension://${STORE}/`]);
      expect(spawnSync(process.execPath, [r.outfile, 'uninstall', '--purge'], { env: homeEnv(home) }).status).toBe(0);
      expect(statSync(BIN).mtimeMs).toBe(devBuilt);
      expect(existsSync(releaseFolder) ? statSync(releaseFolder).mtimeMs : null).toBe(releaseBefore);
    },
    60_000,
  );

  it('release build refuses to run without a store ID', () => {
    const r = buildRelease(null);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Release build needs the store extension ID');
  }, 60_000);

  it('release build refuses a rehearsal ID that differs from the committed one', () => {
    const r = buildRelease(STORE, { PACELINE_STORE_ID: 'ponmlkjihgfedcbaponmlkjihgfedcba' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('differs from the committed store ID');
  }, 60_000);
});
