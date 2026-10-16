import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pickStoreId } from './release-ids.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
// --ids and --outfile let tests build from their own IDs file into a temporary file.
const ids = JSON.parse(readFileSync(arg('--ids') ?? new URL('../shared/src/extension-ids.json', import.meta.url), 'utf8'));

// `--release` builds the npm package into release/: it trusts only the store extension ID.
// The development build in dist/ (source installs) also trusts the dev ID.
const release = process.argv.includes('--release');
let storeId;
try {
  storeId = pickStoreId({
    release,
    envId: process.env.PACELINE_STORE_ID || undefined,
    committedId: ids.store,
    publishing: process.env.npm_lifecycle_event === 'prepublishOnly',
  });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: arg('--outfile') ?? (release ? 'release/paceline.cjs' : 'dist/paceline.cjs'),
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __PACELINE_VERSION__: JSON.stringify(pkg.version),
    __PACELINE_RELEASE__: JSON.stringify(release),
    __PACELINE_STORE_ID__: JSON.stringify(storeId ?? null),
  },
  logLevel: 'info',
});
