import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeMessage, encodeMessage } from '../src/native/framing';
import { tempHome } from './fixtures/lines';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(PKG, 'dist', 'paceline.cjs');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version as string;

const run = (home: string, args: string[], input?: string | Buffer) =>
  spawnSync(process.execPath, [BIN, ...args], { env: { ...process.env, HOME: home, USERPROFILE: home }, input });

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

  it('installs, records a status line update, and uninstalls', () => {
    const home = tempHome();
    mkdirSync(join(home, 'Library', 'Application Support', 'Google', 'Chrome'), { recursive: true });
    mkdirSync(join(home, '.config', 'google-chrome'), { recursive: true });
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
  const RELEASE_BIN = join(PKG, 'release', 'paceline.cjs');
  const buildRelease = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['build.mjs', '--release'], { cwd: PKG, env, encoding: 'utf8' });

  it('release build trusts only the store ID and leaves the development build untouched', () => {
    const devBuilt = statSync(BIN).mtimeMs;
    expect(buildRelease({ ...process.env, PACELINE_STORE_ID: STORE }).status).toBe(0);
    const home = tempHome();
    const profile = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Google', 'Chrome') : join(home, '.config', 'google-chrome');
    mkdirSync(profile, { recursive: true });
    expect(spawnSync(process.execPath, [RELEASE_BIN, 'install'], { env: { ...process.env, HOME: home, USERPROFILE: home } }).status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(profile, 'NativeMessagingHosts', 'com.paceline.host.json'), 'utf8'));
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${STORE}/`]);
    expect(statSync(BIN).mtimeMs).toBe(devBuilt);
  }, 60_000);

  it('release build refuses to run without a store ID', () => {
    const env = { ...process.env };
    delete env.PACELINE_STORE_ID;
    const r = buildRelease(env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Release build needs the store extension ID');
  }, 60_000);
});
