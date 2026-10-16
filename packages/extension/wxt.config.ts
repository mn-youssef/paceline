import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// The public key pins the development extension id that the helper allow-lists.
// The Chrome Web Store rejects a "key" field, so store builds (PACELINE_STORE=1) leave it out,
// and go to their own folder: rebuilding .output/chrome-mv3 without the key would change the ID
// of the unpacked extension loaded from it, and Chrome would drop it on the next restart.
const store = process.env.PACELINE_STORE === '1';
// e2e tests and screenshots build into their own folder: rebuilding .output/chrome-mv3 while a browser has it
// loaded makes Chrome reinstall the extension, which erases its saved history.
const test = process.env.PACELINE_TEST_BUILD === '1';
const devKey = readFileSync(resolve(process.cwd(), 'dev-key.txt'), 'utf8').trim();
const icons = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: store ? '.output-store' : test ? '.output-test' : '.output',
  manifest: {
    name: 'Paceline — usage meter for Claude Code',
    short_name: 'Paceline',
    description: 'See your Claude Code limit at a glance, get alerts before you hit it, and learn which sessions burn your tokens.',
    permissions: ['nativeMessaging', 'storage', 'alarms', 'notifications'],
    optional_host_permissions: ['https://claude.ai/*'],
    icons,
    action: { default_title: 'Paceline', default_icon: icons },
    ...(store ? {} : { key: devKey }),
  },
});
