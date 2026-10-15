import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { writeFileAtomic } from '../fsutil';

export class SettingsParseError extends Error {}

/** True when a statusLine setting is the one `paceline install` wrote. */
export function isOurStatusLine(setting: unknown): boolean {
  const command = (setting as { command?: unknown } | null | undefined)?.command;
  return typeof command === 'string' && command.includes('paceline.cjs') && /\bstatusline\b/.test(command);
}

export function statusLineCommand(nodePath: string, cjsPath: string): string {
  return `"${nodePath}" "${cjsPath}" statusline`;
}

export function readSettings(path: string): { exists: boolean; raw: string | null; data: Record<string, unknown> } {
  if (!existsSync(path)) return { exists: false, raw: null, data: {} };
  const raw = readFileSync(path, 'utf8');
  try {
    const data: unknown = raw.trim() ? JSON.parse(raw) : {};
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('expected a JSON object');
    return { exists: true, raw, data: data as Record<string, unknown> };
  } catch (e) {
    throw new SettingsParseError(`${path}: ${(e as Error).message}`);
  }
}

export function writeSettings(path: string, data: Record<string, unknown>): void {
  // Write through symlinks (dotfile setups): replacing the link with a file would break it.
  const target = existsSync(path) ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o644;
  writeFileAtomic(target, `${JSON.stringify(data, null, 2)}\n`, mode);
}
