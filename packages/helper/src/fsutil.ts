import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Paths } from './paths';

export function readJson<T = unknown>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Write to a temp file in the same directory, then rename, so readers never see half a file. */
export function writeFileAtomic(path: string, data: string, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data, { mode });
  renameSync(tmp, path);
}

export function writeJsonAtomic(path: string, value: unknown): void {
  writeFileAtomic(path, JSON.stringify(value));
}

/** Append a timestamped line to ~/.paceline/logs/<name>, rotating at 1 MB. Never throws. */
export function appendLog(paths: Paths, name: string, message: string): void {
  try {
    mkdirSync(paths.logs, { recursive: true, mode: 0o700 });
    const file = join(paths.logs, name);
    if (existsSync(file) && statSync(file).size > 1_000_000) renameSync(file, `${file}.1`);
    appendFileSync(file, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  } catch {
    // Logging must never break the caller.
  }
}
