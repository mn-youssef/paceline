// Helpers for scripts that install the Paceline helper into a throwaway home folder,
// so they never touch the real ~/.claude, ~/.paceline or browser profiles.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const HOST_NAME = 'com.paceline.host';

export function makeTempHome() {
  const home = mkdtempSync(join(tmpdir(), 'paceline-home-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: join(home, 'AppData', 'Local') };
  return { home, env };
}

export function chromeProfileDir(home, platform = process.platform) {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  return join(home, '.config', 'google-chrome');
}

export function hostManifestPath(home, platform = process.platform) {
  if (platform === 'win32') return join(home, 'AppData', 'Local', 'paceline', `${HOST_NAME}.json`);
  return join(chromeProfileDir(home, platform), 'NativeMessagingHosts', `${HOST_NAME}.json`);
}

/** One Claude Code session with a single assistant turn, an hour ago, and empty Claude Code settings. */
export function writeSampleSession(home, now) {
  const dir = join(home, '.claude', 'projects', '-tmp-smoke-project');
  mkdirSync(dir, { recursive: true });
  const line = {
    type: 'assistant',
    timestamp: new Date(now - 3_600_000).toISOString(),
    cwd: '/tmp/smoke-project',
    sessionId: 'smoke-1',
    message: { id: 'msg_smoke', model: 'claude-sonnet-5-5', usage: { input_tokens: 1200, output_tokens: 300 } },
  };
  writeFileSync(join(dir, 'smoke-1.jsonl'), `${JSON.stringify(line)}\n`);
  writeFileSync(join(home, '.claude', 'settings.json'), '{}\n');
}

/** Starts the launcher the way the browser does and exchanges one framed message (4-byte little-endian length). */
export function sendNative(launcher, message, env, origin) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  const win = process.platform === 'win32';
  const r = spawnSync(win ? `"${launcher}"` : launcher, [origin], { input: Buffer.concat([header, body]), env, shell: win, timeout: 30_000 });
  if (r.status !== 0 || r.stdout.length < 4) throw new Error(`host exited ${r.status}: ${r.stderr.toString().trim()}`);
  return JSON.parse(r.stdout.subarray(4, 4 + r.stdout.readUInt32LE(0)).toString('utf8'));
}
