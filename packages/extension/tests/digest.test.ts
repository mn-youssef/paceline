import { describe, expect, it } from 'vitest';
import type { DashboardData } from '@paceline/shared';
import { makeDashboard } from '@paceline/shared/fixtures';
import { runDigest } from '../src/background/digest';
import { memoryStore, type StoreShape } from '../src/background/store';
import { buildDigest, dueDigestWeek, nextDigestAt } from '../src/core/digest';
import { localDayKey } from '../src/core/habits';

const at = (month: number, day: number, hour = 10) => new Date(2026, month, day, hour, 0).getTime();
const WED = at(9, 14); // Wednesday 14 Oct 2026, 10:00 local
const key = (month: number, day: number) => localDayKey(at(month, day, 12));

function weeks(): DashboardData {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const t = new Date(2026, 8, 28 + i, 12).getTime(); // 28 Sep … 11 Oct
    const lastWeek = i >= 7;
    days.push({ day: localDayKey(t), costUsd: lastWeek ? 60 : 50, sessions: 1, byProject: lastWeek ? { shop: 40, web: 20 } : { web: 50 } });
  }
  const tip = { ruleId: 'long-context', title: 'Running at very long context' };
  const session = (id: string, startedAt: number, tips = [tip]) => ({
    sessionId: id,
    projectName: 'shop',
    startedAt,
    endedAt: startedAt,
    durationMin: 60,
    turns: 10,
    costUsd: 5,
    score: 70,
    grade: 'B' as const,
    tips,
  });
  return makeDashboard({
    range: '30d',
    days,
    sessions: [session('a', at(9, 6)), session('b', at(9, 8), [tip, { ruleId: 'cache-miss', title: 'Cache expired during pauses' }]), session('c', at(9, 13))],
  });
}

describe('digest timing', () => {
  it('fires Monday at 09:00 local', () => {
    expect(nextDigestAt(WED)).toBe(at(9, 19, 9));
    expect(nextDigestAt(at(9, 12, 8))).toBe(at(9, 12, 9));
  });

  it('is due once per week, from Monday 09:00', () => {
    expect(dueDigestWeek(null, at(9, 12, 8))).toBeNull();
    expect(dueDigestWeek(null, at(9, 12, 10))).toBe(key(9, 12));
    expect(dueDigestWeek(key(9, 12), WED)).toBeNull();
    expect(dueDigestWeek(key(9, 5), WED)).toBe(key(9, 12));
  });
});

describe('buildDigest', () => {
  it('summarises last week against the week before', () => {
    expect(buildDigest(weeks(), { [key(9, 14)]: 5 }, 14, WED)).toEqual({
      title: 'Your week with Claude Code',
      message:
        '$420 of API value across 2 sessions (+20% vs the week before). Top project: shop. Most common tip: Running at very long context. 🔥 1-day streak.',
    });
  });

  it('has nothing to say about a week without use', () => {
    expect(buildDigest(makeDashboard({ range: '30d' }), {}, 14, WED)).toBeNull();
  });
});

describe('runDigest', () => {
  function harness(o: { store?: Partial<StoreShape>; dash?: DashboardData } = {}) {
    const notes: { id: string; title: string; message: string }[] = [];
    const alarms: { name: string; when: number }[] = [];
    const store = memoryStore(o.store);
    const deps = {
      now: () => WED,
      store,
      send: async () => ({ v: 1, id: 'x', ok: true, data: o.dash ?? weeks() }),
      notify: async (id: string, n: { title: string; message: string }) => {
        notes.push({ id, ...n });
      },
      scheduleAlarm: async (name: string, when: number) => {
        alarms.push({ name, when });
      },
    };
    return { deps, store, notes, alarms };
  }

  it('sends the digest once a week and keeps the alarm armed', async () => {
    const { deps, store, notes, alarms } = harness();
    expect(await runDigest(deps)).toBe('sent');
    expect(await runDigest(deps)).toBe('not-due');
    expect(notes.map((n) => n.id)).toEqual([`digest:${key(9, 12)}`]);
    expect(store.data.lastDigestWeek).toBe(key(9, 12));
    expect(alarms.at(-1)).toEqual({ name: 'digest', when: at(9, 19, 9) });
  });

  it('waits for quiet hours to end and respects the toggle', async () => {
    const quiet = harness({ store: { settings: { quietHours: { enabled: true, start: '00:00', end: '23:59' } } } });
    expect(await runDigest(quiet.deps)).toBe('not-due');
    expect(quiet.store.data.lastDigestWeek).toBeUndefined();
    const off = harness({ store: { settings: { weeklyDigest: false } } });
    expect(await runDigest(off.deps)).toBe('not-due');
    expect(off.notes).toEqual([]);
  });

  it('stays silent when notifications are off', async () => {
    const { deps, store, notes } = harness({ store: { settings: { notifications: false } } });
    expect(await runDigest(deps)).toBe('not-due');
    expect(notes).toEqual([]);
    expect(store.data.lastDigestWeek).toBeUndefined();
  });

  it('waits until the helper has finished indexing, so a partial week is never sent', async () => {
    const { deps, store, notes } = harness({ dash: { ...weeks(), indexing: true } });
    expect(await runDigest(deps)).toBe('not-due');
    expect(notes).toEqual([]);
    expect(store.data.lastDigestWeek).toBeUndefined();
  });

  it('marks a week without use as done without notifying', async () => {
    const { deps, store, notes } = harness({ dash: makeDashboard({ range: '30d' }) });
    expect(await runDigest(deps)).toBe('skipped');
    expect(notes).toEqual([]);
    expect(store.data.lastDigestWeek).toBe(key(9, 12));
  });
});
