import { describe, expect, it } from 'vitest';
import type { LiveCapture } from '@paceline/shared';
import { makeSnapshot, makeSummary } from '@paceline/shared/fixtures';
import { createSerialQueue } from '../src/background/serial';
import { memoryStore, type Store, type StoreShape } from '../src/background/store';
import { refresh, type RefreshDeps } from '../src/background/refresh';
import { COLORS, type Badge } from '../src/core/badge';
import { localDayKey } from '../src/core/habits';
import type { FallbackResult } from '../src/platform/fallback';
import type { SendNative } from '../src/platform/native';

const NOW = Date.UTC(2026, 9, 13, 12, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;

const capture = (pct5: number, at = NOW - MIN): LiveCapture => ({
  capturedAt: at,
  sessionId: null,
  model: 'claude-opus-5-5',
  fiveHour: { usedPct: pct5, resetsAt: NOW + 2 * HOUR },
  sevenDay: { usedPct: 18, resetsAt: NOW + 72 * HOUR },
});

const hostWith = (c: LiveCapture | null): SendNative => async () => ({
  v: 1,
  id: 'x',
  ok: true,
  data: makeSnapshot({ live: { lastSeenAt: NOW, capture: c }, topSessions: [makeSummary()] }),
});

const unreachable: SendNative = async () => {
  throw new Error('Specified native messaging host not found.');
};

function harness(o: { send?: SendNative; store?: Partial<StoreShape>; fallback?: FallbackResult; permitted?: boolean } = {}) {
  const calls = { badges: [] as Badge[], notes: [] as { id: string; title: string; message: string }[], alarms: [] as { name: string; when: number }[], fallbackFetches: 0 };
  const store = memoryStore(o.store);
  const deps: RefreshDeps = {
    now: () => NOW,
    store,
    send: o.send ?? hostWith(capture(42)),
    setBadge: async (b) => {
      calls.badges.push(b);
    },
    notify: async (id, n) => {
      calls.notes.push({ id, ...n });
    },
    scheduleAlarm: async (name, when) => {
      calls.alarms.push({ name, when });
    },
    fallback: {
      permitted: async () => o.permitted ?? false,
      fetch: async () => {
        calls.fallbackFetches++;
        return o.fallback ?? { ok: false, reason: 'unused' };
      },
    },
  };
  return { deps, store, calls };
}

describe('refresh', () => {
  it('counts a rise once when the claude.ai and status-line readings disagree slightly', async () => {
    const week = (t: number, pct: number) => ({ t, fiveHour: null, sevenDay: { pct, resetsAt: NOW + 72 * HOUR } });
    const { deps, store } = harness({ store: { readings: [week(NOW - 20 * MIN, 17.6), week(NOW - 10 * MIN, 17)] } });
    await refresh(deps);
    expect(store.data.dailyUsage?.[localDayKey(NOW - MIN)]).toBeCloseTo(0.4);
  });

  it("adds the weekly rise to today's usage and reports the habit summary", async () => {
    const earlier = { t: NOW - 10 * MIN, fiveHour: null, sevenDay: { pct: 15, resetsAt: NOW + 72 * HOUR } };
    const { deps, store } = harness({ store: { readings: [earlier] } });
    const out = await refresh(deps);
    expect(store.data.dailyUsage).toEqual({ [localDayKey(NOW - MIN)]: 3 });
    expect(out.habits).toEqual({ todayPct: 3, budgetPct: 14, over: false, streak: 1 });
  });

  it('updates the badge and reset alarms from a fresh capture', async () => {
    const { deps, calls } = harness();
    const out = await refresh(deps);
    expect(out.conn).toBe('ok');
    expect(out.snapshot?.topSessions).toHaveLength(1);
    expect(calls.badges.at(-1)).toMatchObject({ text: '42', color: COLORS.green });
    expect(calls.alarms).toEqual([
      { name: 'reset:5h', when: NOW + 2 * HOUR },
      { name: 'reset:7d', when: NOW + 72 * HOUR },
    ]);
  });

  it('notifies once when a threshold is crossed', async () => {
    const { deps, calls } = harness({ send: hostWith(capture(85)) });
    await refresh(deps);
    await refresh(deps);
    expect(calls.notes.map((n) => n.id)).toEqual([`alert:5h:80:${NOW + 2 * HOUR}`]);
    expect(calls.notes[0]!.title).toBe('85% of your 5-hour limit used');
  });

  it('respects the notifications switch', async () => {
    const { deps, calls } = harness({ send: hostWith(capture(85)), store: { settings: { notifications: false } } });
    await refresh(deps);
    expect(calls.notes).toEqual([]);
  });

  it('flags a missing helper', async () => {
    const { deps, calls } = harness({ send: unreachable });
    const out = await refresh(deps);
    expect(out).toMatchObject({ conn: 'unreachable', snapshot: null, errorMessage: 'Specified native messaging host not found.' });
    expect(calls.badges.at(-1)?.text).toBe('!');
  });

  it('falls back to claude.ai when enabled and Claude Code is quiet', async () => {
    const reading = { fetchedAt: NOW, fiveHour: { usedPct: 61, resetsAt: NOW + HOUR }, sevenDay: null };
    const { deps, calls, store } = harness({
      send: hostWith(capture(42, NOW - 30 * MIN)),
      store: { settings: { fallbackEnabled: true } },
      permitted: true,
      fallback: { ok: true, reading },
    });
    const out = await refresh(deps);
    expect(calls.fallbackFetches).toBe(1);
    expect(out.limits.source).toBe('claude-ai');
    expect(calls.badges.at(-1)?.text).toBe('61');
    await refresh(deps);
    expect(calls.fallbackFetches).toBe(1);
    expect(store.data.fallbackStatus).toEqual({ lastAttemptAt: NOW, disabledUntil: null, reason: null });
  });

  it('backs off for an hour after a fallback failure', async () => {
    const { deps, store } = harness({ send: unreachable, store: { settings: { fallbackEnabled: true } }, permitted: true, fallback: { ok: false, reason: 'usage: HTTP 403' } });
    await refresh(deps);
    expect(store.data.fallbackStatus).toEqual({ lastAttemptAt: NOW, disabledUntil: NOW + HOUR, reason: 'usage: HTTP 403' });
  });

  it('celebrates a reset that happened while the browser was closed, once', async () => {
    const { deps, calls, store } = harness({ send: hostWith(capture(3)), store: { tracker: { '5h': { pct: 72, resetsAt: NOW - 10 * MIN }, '7d': null } } });
    const out = await refresh(deps);
    expect(out.celebratePending).toBe(true);
    expect(calls.notes.map((n) => n.title)).toEqual(['Fresh limit! 🎉']);
    expect(calls.badges.at(-1)?.text).toBe('NEW');
    await refresh(deps);
    expect(calls.notes).toHaveLength(1);
    expect(store.data.celebrateUntil).toBe(NOW + 30 * MIN);
  });

  it('runs overlapping refreshes one at a time, so nothing is announced twice', async () => {
    const { deps, calls } = harness({ send: hostWith(capture(85)), store: { tracker: { '5h': { pct: 72, resetsAt: NOW - 10 * MIN }, '7d': null } } });
    const tick = () => new Promise((r) => setTimeout(r, 1));
    const slow: Store = {
      get: async (key) => {
        await tick();
        return deps.store.get(key);
      },
      set: async (patch) => {
        await tick();
        await deps.store.set(patch);
      },
    };
    const enqueue = createSerialQueue();
    const slowDeps = { ...deps, store: slow };
    await Promise.all([enqueue(() => refresh(slowDeps)), enqueue(() => refresh(slowDeps))]);
    expect(calls.notes.map((n) => n.title)).toEqual(['Fresh limit! 🎉', '85% of your 5-hour limit used']);
  });

  // 30 %/h over the last 40 min, reaching 60% now: runs out ~80 min from now, 40 min before the reset.
  const climbing = [41, 36, 31, 26, 21, 16, 11, 6].map((m) => ({
    t: NOW - m * MIN,
    fiveHour: { pct: 60 - ((m - 1) / 60) * 30, resetsAt: NOW + 2 * HOUR },
    sevenDay: null,
  }));

  it('records fresh readings and forecasts from them', async () => {
    const { deps, store } = harness({ send: hostWith(capture(60)), store: { readings: climbing } });
    const out = await refresh(deps);
    expect(store.data.readings).toHaveLength(9);
    expect(out.forecasts['5h']).toMatchObject({ status: 'before-reset', paceRatio: expect.closeTo(1.5, 6) });
    expect(out.forecasts['7d']).toMatchObject({ status: 'learning' });
  });

  it('puts the forecast in a threshold alert instead of sending a second notification', async () => {
    const { deps, calls } = harness({ send: hostWith(capture(60)), store: { readings: climbing } });
    await refresh(deps);
    await refresh(deps);
    expect(calls.notes.map((n) => n.id)).toEqual([`alert:5h:50:${NOW + 2 * HOUR}`]);
    expect(calls.notes[0]!.message).toContain('At this pace you hit 100% at');
  });

  it('warns once when on pace to hit the limit between thresholds', async () => {
    const preset = { '5h': { resetsAt: NOW + 2 * HOUR, fired: [50] }, '7d': { resetsAt: null, fired: [] } };
    const { deps, calls } = harness({ send: hostWith(capture(60)), store: { readings: climbing, alerts: preset } });
    await refresh(deps);
    await refresh(deps);
    expect(calls.notes.map((n) => n.title)).toEqual(['On pace to hit your 5-hour limit']);
  });

  it('respects the pace alert switch', async () => {
    const preset = { '5h': { resetsAt: NOW + 2 * HOUR, fired: [50] }, '7d': { resetsAt: null, fired: [] } };
    const { deps, calls } = harness({ send: hostWith(capture(60)), store: { readings: climbing, alerts: preset, settings: { paceAlerts: false } } });
    await refresh(deps);
    expect(calls.notes.some((n) => n.id.startsWith('pace:'))).toBe(false);
  });

  it('does not forecast or warn from stale readings', async () => {
    const { deps, calls } = harness({ send: hostWith(capture(60, NOW - 20 * MIN)), store: { readings: climbing } });
    const out = await refresh(deps);
    expect(out.forecasts).toEqual({ '5h': null, '7d': null });
    expect(calls.notes.some((n) => n.id.startsWith('pace:'))).toBe(false);
  });

  it('keeps pace alerts quiet during quiet hours and with notifications off', async () => {
    const preset = { '5h': { resetsAt: NOW + 2 * HOUR, fired: [50] }, '7d': { resetsAt: null, fired: [] } };
    for (const settings of [{ quietHours: { enabled: true, start: '00:00', end: '23:59' } }, { notifications: false }]) {
      const { deps, calls } = harness({ send: hostWith(capture(60)), store: { readings: climbing, alerts: preset, settings } });
      await refresh(deps);
      expect(calls.notes).toEqual([]);
    }
  });
});
