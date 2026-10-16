// Checks that everything is ready for a release and builds what gets uploaded and published.
// Stops at the first problem. Usage: pnpm release:check   (rehearsal: PACELINE_STORE_ID=<32 letters a-p> pnpm release:check)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeProfileDir, hostManifestPath, makeTempHome } from './lib/temp-home.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const helperDir = join(root, 'packages', 'helper');
const extensionDir = join(root, 'packages', 'extension');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ok = (msg) => console.log(`✓ ${msg}`);
function fail(msg, output = '') {
  if (output) console.error(output.trim().split('\n').slice(-30).join('\n'));
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', ...opts });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
}

// The check installs the release helper into a temporary home; on Windows that would write the real registry.
if (process.platform === 'win32') fail('Run the release check on macOS or Linux.');

// 1. Nothing uncommitted can end up in the zip or the npm package.
if (run('git', ['status', '--porcelain']).stdout.trim()) fail('Commit or stash your changes first.');
ok('Git working tree is clean');

// 2. One version for the helper and the extension.
const version = readJson(join(helperDir, 'package.json')).version;
const extensionVersion = readJson(join(extensionDir, 'package.json')).version;
if (version !== extensionVersion) fail(`The helper (${version}) and the extension (${extensionVersion}) must have the same version.`);
ok(`Version ${version}`);

// 3. The Chrome Web Store extension ID, which the published helper trusts exclusively.
const ids = readJson(join(root, 'packages', 'shared', 'src', 'extension-ids.json'));
const storeId = process.env.PACELINE_STORE_ID || ids.store;
if (!/^[a-p]{32}$/.test(storeId ?? '')) {
  fail('No store extension ID. Upload the zip as a draft first, then set "store" in packages/shared/src/extension-ids.json (see RELEASING.md).');
}
ok(`Store extension ID ${storeId}${process.env.PACELINE_STORE_ID ? ' (rehearsal, from PACELINE_STORE_ID)' : ''}`);

// 4. Typecheck and unit tests.
for (const script of ['typecheck', 'test']) {
  const r = run('pnpm', [script]);
  if (!r.ok) fail(`pnpm ${script} failed.`, r.out);
  ok(`pnpm ${script}`);
}

// 5. The store zip: no development key, the right version.
const zip = run('pnpm', ['--filter', '@paceline/extension', 'zip']);
if (!zip.ok) fail('The store zip did not build.', zip.out);
const zipPath = join(extensionDir, '.output-store', `pacelineextension-${version}-chrome.zip`);
if (!existsSync(zipPath)) fail(`Expected ${zipPath}.`);
const manifest = readJson(join(extensionDir, '.output-store', 'chrome-mv3', 'manifest.json'));
if ('key' in manifest) fail('The store manifest contains a "key"; the Chrome Web Store rejects it.');
if (manifest.version !== version) fail(`The store manifest says version ${manifest.version}, expected ${version}.`);
ok(`Store zip ${zipPath}`);

// 6. The release helper trusts only the store extension.
const build = run(process.execPath, ['build.mjs', '--release'], { cwd: helperDir, env: { ...process.env, PACELINE_STORE_ID: storeId } });
if (!build.ok) fail('The release helper did not build.', build.out);
const { home, env } = makeTempHome();
try {
  mkdirSync(chromeProfileDir(home), { recursive: true });
  const install = run(process.execPath, [join(helperDir, 'release', 'paceline.cjs'), 'install'], { env });
  if (!install.ok) fail('The release helper failed to install into a test home.', install.out);
  const origins = readJson(hostManifestPath(home)).allowed_origins;
  if (JSON.stringify(origins) !== JSON.stringify([`chrome-extension://${storeId}/`])) {
    fail(`The release helper trusts ${JSON.stringify(origins)}; it must trust only the store extension.`);
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}
ok('Release helper trusts only the store extension');

// 7. Exactly the files the npm package needs.
const pack = run('npm', ['pack', '--dry-run', '--json'], { cwd: helperDir });
if (!pack.ok) fail('npm pack failed.', pack.out);
const files = JSON.parse(pack.stdout)[0].files.map((f) => f.path).sort();
const expected = ['LICENSE', 'README.md', 'package.json', 'release/paceline.cjs'];
if (JSON.stringify(files) !== JSON.stringify(expected)) fail(`npm would publish ${files.join(', ')}; expected ${expected.join(', ')}.`);
ok(`npm package: ${files.join(', ')}`);

console.log(`
Ready to release ${version}. Next steps (details in RELEASING.md):
  1. Upload ${zipPath} in the Chrome Web Store Developer Dashboard.
  2. Publish the helper:   cd packages/helper && pnpm publish
  3. Tag the release:      git tag v${version} && git push --tags`);
