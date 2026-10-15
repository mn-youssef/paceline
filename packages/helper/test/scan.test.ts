import { appendFileSync, chmodSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalize } from '../src/parse/accumulator';
import { resolvePaths } from '../src/paths';
import { LOCK_STALE_MS, scan } from '../src/scan';
import { assistantLine, tempHome, writeLog } from './fixtures/lines';

const NOW = Date.now();
const turns = (n: number, from = 0) => Array.from({ length: n }, (_, i) => assistantLine({ id: `m${from + i}`, at: (from + i) * 1_000 }));
const asText = (lines: string[]) => lines.map((l) => `${l}\n`).join('');

describe('scan', () => {
  it('indexes main and subagent logs under their session id', () => {
    const home = tempHome();
    writeLog(home, '-Users-dev-my-app', 's1', turns(3));
    writeLog(home, '-Users-dev-my-app', 's1', [assistantLine({ id: 'sub1', at: 500, sidechain: true })], 'agent-abc');
    const r = scan({ paths: resolvePaths(home), now: NOW });
    expect(r.complete).toBe(true);
    const main = r.states.find((s) => !s.isSubagentFile);
    const sub = r.states.find((s) => s.isSubagentFile);
    expect(main).toMatchObject({ sessionId: 's1', turns: 3 });
    expect(sub).toMatchObject({ sessionId: 's1', isSubagentFile: true });
  });

  it('indexes workflow agent logs nested under subagents/', () => {
    const home = tempHome();
    writeLog(home, 'p', 's1', turns(1));
    const dir = join(home, '.claude', 'projects', 'p', 's1', 'subagents', 'workflows', 'wf_123');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'agent-x.jsonl'), asText([assistantLine({ id: 'w1', at: 0, sidechain: true })]));
    const r = scan({ paths: resolvePaths(home), now: NOW });
    expect(r.states.filter((s) => s.isSubagentFile).map((s) => s.sessionId)).toEqual(['s1']);
  });

  it('skips a log it cannot read and still indexes the rest', () => {
    const home = tempHome();
    const bad = writeLog(home, 'p', 'bad', turns(2));
    writeLog(home, 'p', 'good', turns(3));
    chmodSync(bad, 0o000);
    try {
      const r = scan({ paths: resolvePaths(home), now: NOW });
      expect(r.states.map((s) => [s.sessionId, s.turns])).toEqual([['good', 3]]);
      expect(r.unreadable).toEqual([bad]);
    } finally {
      chmodSync(bad, 0o644);
    }
  });

  it('continues from the saved offset and matches a full parse', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    const file = writeLog(home, 'p', 's1', turns(5));
    scan({ paths, now: NOW });
    appendFileSync(file, asText(turns(4, 5)));
    const incremental = scan({ paths, now: NOW }).states[0]!;

    const fresh = tempHome();
    writeLog(fresh, 'p', 's1', turns(9));
    const full = scan({ paths: resolvePaths(fresh), now: NOW }).states[0]!;
    expect(finalize(incremental)).toEqual(finalize(full));
  });

  it('stops when the time budget runs out and resumes on the next scan', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    writeLog(home, 'p', 's1', turns(2));
    writeLog(home, 'p', 's2', turns(2));
    let t = 0;
    const first = scan({ paths, now: NOW, budgetMs: 1_500, clock: () => (t += 1_000) });
    expect(first.complete).toBe(false);
    const second = scan({ paths, now: NOW });
    expect(second.complete).toBe(true);
    expect(second.states.map((s) => s.turns)).toEqual([2, 2]);
  });

  it('re-parses a file that was replaced by a shorter one', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    const file = writeLog(home, 'p', 's1', turns(3));
    scan({ paths, now: NOW });
    writeFileSync(file, asText(turns(1)));
    expect(scan({ paths, now: NOW }).states[0]!.turns).toBe(1);
  });

  it('waits for a line that is still being written', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    const file = writeLog(home, 'p', 's1', turns(2));
    const third = assistantLine({ id: 'm2', at: 2_000 });
    appendFileSync(file, third.slice(0, 40));
    expect(scan({ paths, now: NOW }).states[0]!.turns).toBe(2);
    appendFileSync(file, `${third.slice(40)}\n`);
    expect(scan({ paths, now: NOW }).states[0]!.turns).toBe(3);
  });

  it('ignores logs older than the retention window', () => {
    const home = tempHome();
    const file = writeLog(home, 'p', 's1', turns(1));
    const old = (NOW - 40 * 86_400_000) / 1_000;
    utimesSync(file, old, old);
    expect(scan({ paths: resolvePaths(home), now: NOW }).states).toEqual([]);
  });

  it('serves cached states without scanning while another process holds the lock', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    const file = writeLog(home, 'p', 's1', turns(2));
    scan({ paths, now: NOW });
    appendFileSync(file, asText(turns(1, 2)));
    writeFileSync(paths.lock, '999');
    const r = scan({ paths, now: NOW });
    expect(r).toMatchObject({ locked: true, complete: false });
    expect(r.states[0]!.turns).toBe(2);
  });

  it('ignores cached states of an older format while another process re-indexes', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    writeLog(home, 'p', 's1', turns(2));
    scan({ paths, now: NOW });
    const cache = JSON.parse(readFileSync(paths.filesCache, 'utf8')) as { files: Record<string, { state: { v: number } }> };
    for (const e of Object.values(cache.files)) e.state.v = 1;
    writeFileSync(paths.filesCache, JSON.stringify(cache));
    writeFileSync(paths.lock, '999');
    expect(scan({ paths, now: NOW })).toMatchObject({ locked: true, states: [] });
  });

  it('takes over a stale lock', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    writeLog(home, 'p', 's1', turns(2));
    mkdirSync(paths.cacheDir, { recursive: true });
    writeFileSync(paths.lock, '999');
    const old = (Date.now() - LOCK_STALE_MS - 5_000) / 1_000;
    utimesSync(paths.lock, old, old);
    expect(scan({ paths, now: NOW })).toMatchObject({ locked: false, complete: true });
  });
});
