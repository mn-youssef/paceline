import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// The public key pins the development extension id that the helper allow-lists.
// The Chrome Web Store rejects a "key" field, so store builds (PACELINE_STORE=1) leave it out.
const devKey = readFileSync(resolve(process.cwd(), 'dev-key.txt'), 'utf8').trim();
const icons = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Paceline — usage meter for Claude Code',
    short_name: 'Paceline',
    description: 'See your Claude Code limit at a glance, get alerts before you hit it, and learn which sessions burn your tokens.',
    permissions: ['nativeMessaging', 'storage', 'alarms', 'notifications'],
    optional_host_permissions: ['https://claude.ai/*'],
    icons,
    action: { default_title: 'Paceline', default_icon: icons },
    ...(process.env.PACELINE_STORE === '1' ? {} : { key: devKey }),
  },
});
