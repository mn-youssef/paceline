import { spawnSync } from 'node:child_process';
import type { LiveCapture, LiveState } from '@paceline/shared';
import { readConfig } from './config';
import { appendLog, writeJsonAtomic } from './fsutil';
import { captureFromStatusInput, readLive } from './live';
import type { Paths } from './paths';

export interface StatusLineDeps {
  paths: Paths;
  now: number;
  stdin: string;
  runPrevious: (command: string, input: string) => string | null;
  log: (message: string) => void;
}

export function defaultLine(c: LiveCapture | null): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.fiveHour) parts.push(`5h ${Math.round(c.fiveHour.usedPct)}%`);
  if (c.sevenDay) parts.push(`7d ${Math.round(c.sevenDay.usedPct)}%`);
  return parts.join(' · ');
}

/** Records the limits Claude Code reports, then prints the user's own status line (or ours). Never throws. */
export function runStatusLine(d: StatusLineDeps): string {
  let input: unknown = null;
  try {
    input = JSON.parse(d.stdin);
  } catch (e) {
    d.log(`bad stdin: ${(e as Error).message}`);
  }
  const capture = captureFromStatusInput(input, d.now);
  try {
    const previous = readLive(d.paths);
    writeJsonAtomic(d.paths.live, { lastSeenAt: d.now, capture: capture ?? previous.capture } satisfies LiveState);
  } catch (e) {
    d.log(`live.json write failed: ${(e as Error).message}`);
  }
  const chained = readConfig(d.paths)?.previousStatusLine;
  if (typeof chained?.command === 'string' && chained.command.length > 0) {
    try {
      return d.runPrevious(chained.command, d.stdin) ?? '';
    } catch (e) {
      d.log(`previous status line failed: ${(e as Error).message}`);
      return '';
    }
  }
  return defaultLine(capture);
}

export async function readStdin(limitBytes: number): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > limitBytes) break;
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function statuslineMain(paths: Paths): Promise<void> {
  const stdin = await readStdin(1024 * 1024);
  const out = runStatusLine({
    paths,
    now: Date.now(),
    stdin,
    log: (m) => appendLog(paths, 'statusline.log', m),
    runPrevious: (command, input) => {
      const r = spawnSync(command, { shell: true, input, encoding: 'utf8', timeout: 1_500 });
      return r.error ? null : r.stdout;
    },
  });
  process.stdout.write(out);
}
