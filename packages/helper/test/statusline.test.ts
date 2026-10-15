import { describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '../src/fsutil';
import { captureFromStatusInput, readLive } from '../src/live';
import { resolvePaths } from '../src/paths';
import { runStatusLine, type StatusLineDeps } from '../src/statusline';
import { tempHome } from './fixtures/lines';

const input = JSON.stringify({
  session_id: 'abc',
  model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
  rate_limits: {
    five_hour: { used_percentage: 42, resets_at: 1_790_000_000 },
    seven_day: { used_percentage: 18, resets_at: 1_790_500_000 },
  },
});

const deps = (home: string, over: Partial<StatusLineDeps> = {}): StatusLineDeps => ({
  paths: resolvePaths(home),
  now: 1_000,
  stdin: input,
  runPrevious: () => {
    throw new Error('no previous status line expected');
  },
  log: () => {},
  ...over,
});

describe('captureFromStatusInput', () => {
  it('converts epoch seconds to milliseconds', () => {
    expect(captureFromStatusInput(JSON.parse(input), 5)).toEqual({
      capturedAt: 5,
      sessionId: 'abc',
      model: 'claude-opus-5-5',
      fiveHour: { usedPct: 42, resetsAt: 1_790_000_000_000 },
      sevenDay: { usedPct: 18, resetsAt: 1_790_500_000_000 },
    });
  });

  it('returns null when no limit window is reported', () => {
    expect(captureFromStatusInput({ rate_limits: null }, 5)).toBeNull();
    expect(captureFromStatusInput({ rate_limits: { five_hour: { used_percentage: '42' } } }, 5)).toBeNull();
  });
});

describe('runStatusLine', () => {
  it('records the limits and prints a compact default line', () => {
    const home = tempHome();
    expect(runStatusLine(deps(home))).toBe('5h 42% · 7d 18%');
    expect(readLive(resolvePaths(home))).toMatchObject({ lastSeenAt: 1_000, capture: { capturedAt: 1_000, fiveHour: { usedPct: 42 } } });
  });

  it('keeps the last capture when an update carries no limits', () => {
    const home = tempHome();
    runStatusLine(deps(home));
    expect(runStatusLine(deps(home, { now: 2_000, stdin: '{}' }))).toBe('');
    expect(readLive(resolvePaths(home))).toMatchObject({ lastSeenAt: 2_000, capture: { capturedAt: 1_000 } });
  });

  it('chains the status line the user had before', () => {
    const home = tempHome();
    writeJsonAtomic(resolvePaths(home).config, { previousStatusLine: { type: 'command', command: 'my-line.sh' } });
    const seen: string[] = [];
    const out = runStatusLine(
      deps(home, {
        runPrevious: (command, stdin) => {
          seen.push(command, stdin);
          return 'custom ✓';
        },
      }),
    );
    expect(out).toBe('custom ✓');
    expect(seen).toEqual(['my-line.sh', input]);
  });

  it('survives unreadable input', () => {
    const home = tempHome();
    const logs: string[] = [];
    expect(runStatusLine(deps(home, { stdin: 'not json', log: (m) => logs.push(m) }))).toBe('');
    expect(logs[0]).toMatch(/bad stdin/);
    expect(readLive(resolvePaths(home)).lastSeenAt).toBe(1_000);
  });
});
