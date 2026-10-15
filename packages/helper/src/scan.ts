import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJson, writeJsonAtomic } from './fsutil';
import { ACC_VERSION, applyEvent, newAccState, type AccState } from './parse/accumulator';
import { parseLine } from './parse/line';
import { readLinesFrom } from './parse/reader';
import type { Paths } from './paths';

export const CACHE_VERSION = 1;
export const LOCK_STALE_MS = 120_000;
const DAY = 86_400_000;

export interface LogFile {
  path: string;
  sessionId: string;
  isSubagent: boolean;
  size: number;
  mtimeMs: number;
  ino: number;
}

export interface FileEntry {
  sessionId: string;
  isSubagent: boolean;
  size: number;
  mtimeMs: number;
  ino: number;
  offset: number;
  state: AccState;
}

export interface FileCache {
  v: number;
  files: Record<string, FileEntry>;
}

export interface ScanOptions {
  paths: Paths;
  now: number;
  budgetMs?: number;
  maxAgeDays?: number;
  clock?: () => number;
  onProgress?: (done: number, total: number) => void;
}

export interface ScanResult {
  states: AccState[];
  complete: boolean;
  locked: boolean;
  /** Logs that could not be read this time (permissions, deleted mid-scan); they are skipped. */
  unreadable: string[];
}

function entries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** ~/.claude/projects/<project>/<session>.jsonl and …/<session>/subagents/**\/*.jsonl, newest first. */
export function listLogFiles(projectsDir: string, minMtimeMs: number): LogFile[] {
  const out: LogFile[] = [];
  const push = (path: string, sessionId: string, isSubagent: boolean) => {
    try {
      const st = statSync(path);
      if (st.mtimeMs >= minMtimeMs) out.push({ path, sessionId, isSubagent, size: st.size, mtimeMs: st.mtimeMs, ino: st.ino });
    } catch {
      // Deleted between readdir and stat.
    }
  };
  // Subagent logs sit in <session>/subagents/, and workflow agents one or two levels below that.
  const collectSubagents = (dir: string, sessionId: string, depth: number) => {
    for (const ent of entries(dir)) {
      const path = join(dir, ent.name);
      if (ent.isFile() && ent.name.endsWith('.jsonl')) push(path, sessionId, true);
      else if (ent.isDirectory() && depth < 3) collectSubagents(path, sessionId, depth + 1);
    }
  };
  for (const project of entries(projectsDir)) {
    if (!project.isDirectory()) continue;
    const projectDir = join(projectsDir, project.name);
    for (const ent of entries(projectDir)) {
      if (ent.isFile() && ent.name.endsWith('.jsonl')) push(join(projectDir, ent.name), ent.name.slice(0, -'.jsonl'.length), false);
      else if (ent.isDirectory()) collectSubagents(join(projectDir, ent.name, 'subagents'), ent.name, 0);
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function loadCache(path: string): FileCache {
  const c = readJson<FileCache>(path);
  return c && c.v === CACHE_VERSION && c.files && typeof c.files === 'object' ? c : { v: CACHE_VERSION, files: {} };
}

function acquireLock(path: string): boolean {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  try {
    if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
      unlinkSync(path);
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      return true;
    }
  } catch {
    // Another process won the race for the stale lock.
  }
  return false;
}

function releaseLock(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

export function scan(o: ScanOptions): ScanResult {
  const cache = loadCache(o.paths.filesCache);
  if (!acquireLock(o.paths.lock)) {
    // Another process is indexing. Serve what is cached, but never states in an older format:
    // right after an upgrade those lack fields the current code reads.
    const states = Object.values(cache.files).map((e) => e.state).filter((st) => st.v === ACC_VERSION);
    return { states, complete: false, locked: true, unreadable: [] };
  }
  try {
    const clock = o.clock ?? Date.now;
    const start = clock();
    const budget = o.budgetMs ?? Number.POSITIVE_INFINITY;
    const files = listLogFiles(o.paths.projectsDir, o.now - (o.maxAgeDays ?? 35) * DAY);
    const next: Record<string, FileEntry> = {};
    const unreadable: string[] = [];
    let complete = true;
    let changed = false;
    let done = 0;

    for (const f of files) {
      let e = cache.files[f.path];
      if (!e || e.ino !== f.ino || f.size < e.offset || e.state.v !== ACC_VERSION) {
        e = { sessionId: f.sessionId, isSubagent: f.isSubagent, size: 0, mtimeMs: 0, ino: f.ino, offset: 0, state: newAccState(f.sessionId, f.isSubagent) };
        changed = true;
      }
      try {
        let eof = e.offset >= f.size;
        while (!eof) {
          if (clock() - start >= budget) {
            complete = false;
            break;
          }
          const chunk = readLinesFrom(f.path, e.offset);
          for (const line of chunk.lines) {
            const ev = parseLine(line);
            if (ev) applyEvent(e.state, ev);
          }
          if (chunk.nextOffset !== e.offset) changed = true;
          e.offset = chunk.nextOffset;
          eof = chunk.eof;
        }
        e.size = f.size;
        e.mtimeMs = f.mtimeMs;
        next[f.path] = e;
      } catch {
        // One unreadable log (root-owned, deleted mid-scan) must not hide every other session.
        // Keep what was already indexed from it; offset and state always advance together.
        unreadable.push(f.path);
        if (e.offset > 0) next[f.path] = e;
      }
      o.onProgress?.(++done, files.length);
    }

    if (Object.keys(cache.files).some((p) => !(p in next))) changed = true;
    if (changed) writeJsonAtomic(o.paths.filesCache, { v: CACHE_VERSION, files: next } satisfies FileCache);
    return { states: Object.values(next).map((e) => e.state), complete, locked: false, unreadable };
  } finally {
    releaseLock(o.paths.lock);
  }
}
