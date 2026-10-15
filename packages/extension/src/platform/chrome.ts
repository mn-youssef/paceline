import { browser } from 'wxt/browser';
import { CLAUDE_AI_ORIGIN, HOST_NAME } from '@paceline/shared';
import type { RefreshDeps } from '../background/refresh';
import type { Store, StoreShape } from '../background/store';
import { fetchClaudeAiUsage } from './fallback';
import type { SendNative } from './native';

export const chromeStore: Store = {
  async get<K extends keyof StoreShape>(key: K) {
    const all = await browser.storage.local.get(key);
    return all[key] as StoreShape[K] | undefined;
  },
  async set(patch) {
    await browser.storage.local.set(patch);
  },
};

export const chromeSend: SendNative = (message) => browser.runtime.sendNativeMessage(HOST_NAME, message as Record<string, unknown>);

export function chromeDeps(): RefreshDeps {
  return {
    now: Date.now,
    store: chromeStore,
    send: chromeSend,
    async setBadge(b) {
      await browser.action.setBadgeText({ text: b.text });
      await browser.action.setBadgeBackgroundColor({ color: b.color });
      await browser.action.setBadgeTextColor({ color: '#ffffff' });
      await browser.action.setTitle({ title: b.title });
    },
    async notify(id, n) {
      await browser.notifications.create(id, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title: n.title,
        message: n.message,
      });
    },
    async scheduleAlarm(name, when) {
      await browser.alarms.create(name, { when });
    },
    fallback: {
      permitted: () => browser.permissions.contains({ origins: [CLAUDE_AI_ORIGIN] }),
      fetch: () => fetchClaudeAiUsage(fetch.bind(globalThis), Date.now()),
    },
  };
}

export async function openCelebration(): Promise<void> {
  await browser.windows.create({ url: browser.runtime.getURL('/celebrate.html'), type: 'popup', width: 440, height: 360, focused: true });
}

export async function openDashboard(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
}
