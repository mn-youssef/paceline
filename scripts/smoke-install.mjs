// Install smoke test: installs the helper into a temporary home, talks to it the way the browser does,
// then uninstalls it and checks nothing is left. Usage: node scripts/smoke-install.mjs <helper.cjs>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HOST_NAME, chromeProfileDir, hostManifestPath, makeTempHome, sendNative, writeSampleSession } from './lib/temp-home.mjs';

const helper = resolve(process.argv[2] ?? '');
const ids = JSON.parse(readFileSync(new URL('../packages/shared/src/extension-ids.json', import.meta.url), 'utf8'));
const origin = `chrome-extension://${ids.dev}/`;
const win = process.platform === 'win32';
const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`✓ ${msg}`);

if (win && process.env.CI !== 'true') fail('The smoke test writes the Windows registry; it only runs in CI.');
if (!existsSync(helper)) fail(`Helper not found: ${helper}. Run pnpm build first.`);

const { home, env } = makeTempHome();
const run = (...args) => spawnSync(process.execPath, [helper, ...args], { env, encoding: 'utf8', timeout: 120_000 });
try {
  writeSampleSession(home, Date.now());
  mkdirSync(chromeProfileDir(home), { recursive: true });

  const install = run('install');
  if (install.status !== 0) fail(`install exited ${install.status}: ${install.stderr || install.stdout}`);
  ok('install');

  const manifestPath = hostManifestPath(home);
  if (!existsSync(manifestPath)) fail(`no host manifest at ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.allowed_origins.includes(origin)) fail(`manifest does not allow ${origin}`);
  if (!existsSync(manifest.path)) fail(`launcher missing: ${manifest.path}`);
  if (win && spawnSync('reg', ['query', regKey]).status !== 0) fail(`registry key missing: ${regKey}`);
  ok(`browser registration (${manifestPath})`);

  const ping = sendNative(manifest.path, { v: 1, id: 'smoke-ping', type: 'ping' }, env, origin);
  if (!ping.ok || ping.data.protocol !== 1) fail(`unexpected ping answer: ${JSON.stringify(ping)}`);
  ok(`ping (helper ${ping.data.helperVersion}, protocol 1)`);

  const snap = sendNative(manifest.path, { v: 1, id: 'smoke-snap', type: 'snapshot', window: '7d' }, env, origin);
  if (!snap.ok || snap.data.topSessions[0]?.sessionId !== 'smoke-1') fail(`snapshot does not list the sample session: ${JSON.stringify(snap).slice(0, 300)}`);
  ok('snapshot lists the sample session');

  const uninstall = run('uninstall', '--purge');
  if (uninstall.status !== 0) fail(`uninstall exited ${uninstall.status}: ${uninstall.stderr || uninstall.stdout}`);
  if (existsSync(join(home, '.paceline'))) fail('~/.paceline still exists');
  if (existsSync(manifestPath)) fail('host manifest still exists');
  if ('statusLine' in JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'))) fail('status line still set');
  if (win && spawnSync('reg', ['query', regKey]).status === 0) fail(`registry key still present: ${regKey}`);
  ok('uninstall --purge left nothing behind');
} finally {
  rmSync(home, { recursive: true, force: true });
}
