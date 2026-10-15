import { readJson } from './fsutil';
import type { Paths } from './paths';

/** Claude Code's `statusLine` setting. Unknown keys are preserved. */
export interface StatusLineSetting {
  type?: string;
  command?: string;
  padding?: number;
  [key: string]: unknown;
}

export interface PacelineConfig {
  version: string;
  installedAt: number;
  previousStatusLine: StatusLineSetting | null;
  extensionIds: string[];
  nodePath: string;
}

export function readConfig(paths: Paths): PacelineConfig | null {
  return readJson<PacelineConfig>(paths.config);
}
