import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { PopupMessage } from '../src/background/messages';
import { runDigest } from '../src/background/digest';
import { refresh, type RefreshOutcome } from '../src/background/refresh';
import { createSerialQueue } from '../src/background/serial';
import { NO_FORECASTS } from '../src/core/forecast';
import { NO_HABITS } from '../src/core/habits';
import { NO_LIMITS } from '../src/core/limits';
import { chromeDeps, openCelebration, openDashboard } from '../src/platform/chrome';

export default defineBackground(() => {
  const deps = chromeDeps();
  const enqueue = createSerialQueue();
  const run = (window?: Parameters<typeof refresh>[1]) => enqueue(() => refresh(deps, window));
  const digest = () => enqueue(() => runDigest(deps));
  const start = () => {
    void browser.alarms.create('tick', { periodInMinutes: 1 });
    void run();
    void digest();
  };
  browser.runtime.onInstalled.addListener(start);
  browser.runtime.onStartup.addListener(start);

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'tick') {
      void run();
      void digest();
    } else if (alarm.name.startsWith('reset:')) void run();
    else if (alarm.name === 'digest') void digest();
  });

  browser.notifications.onClicked.addListener((id) => {
    void browser.notifications.clear(id);
    if (id.startsWith('celebrate:')) void openCelebration();
    else if (id.startsWith('digest:')) void openDashboard();
  });

  browser.runtime.onMessage.addListener((msg: PopupMessage, _sender, sendResponse) => {
    if (msg?.type === 'refresh') {
      run(msg.window).then(sendResponse, (e: unknown) =>
        sendResponse({ conn: 'error', limits: NO_LIMITS, snapshot: null, errorMessage: String(e), celebratePending: false, forecasts: NO_FORECASTS, habits: NO_HABITS } satisfies RefreshOutcome),
      );
      return true;
    }
    if (msg?.type === 'consumeCelebration') {
      void enqueue(() => deps.store.set({ celebratePending: false })).then(() => sendResponse(true));
      return true;
    }
    return false;
  });
});
