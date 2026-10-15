import { browser } from 'wxt/browser';
import type { WindowKey } from '@paceline/shared';
import type { RefreshOutcome } from './refresh';

export type PopupMessage = { type: 'refresh'; window: WindowKey } | { type: 'consumeCelebration' };

export function requestRefresh(window: WindowKey): Promise<RefreshOutcome> {
  return browser.runtime.sendMessage({ type: 'refresh', window } satisfies PopupMessage);
}

export function consumeCelebration(): Promise<unknown> {
  return browser.runtime.sendMessage({ type: 'consumeCelebration' } satisfies PopupMessage);
}
