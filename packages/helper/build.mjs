import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const ids = JSON.parse(readFileSync(new URL('../shared/src/extension-ids.json', import.meta.url), 'utf8'));

// `--release` builds the npm package into release/: it trusts only the store extension ID.
// The development build in dist/ (source installs) also trusts the dev ID.
const release = process.argv.includes('--release');
const storeId = release ? (process.env.PACELINE_STORE_ID || ids.store) : ids.store;
if (release && !/^[a-p]{32}$/.test(storeId ?? '')) {
  console.error('Release build needs the store extension ID: set "store" in packages/shared/src/extension-ids.json.');
  process.exit(1);
}

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: release ? 'release/paceline.cjs' : 'dist/paceline.cjs',
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __PACELINE_VERSION__: JSON.stringify(pkg.version),
    __PACELINE_RELEASE__: JSON.stringify(release),
    __PACELINE_STORE_ID__: JSON.stringify(storeId ?? null),
  },
  logLevel: 'info',
});
