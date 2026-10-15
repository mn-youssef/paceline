import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/paceline.cjs',
  banner: { js: '#!/usr/bin/env node' },
  define: { __PACELINE_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});
