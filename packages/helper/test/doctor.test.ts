import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctor, formatChecks } from '../src/doctor';
import { writeJsonAtomic } from '../src/fsutil';
import { install } from '../src/install/install';
import { noRegistry } from '../src/install/registry';
import { resolvePaths } from '../src/paths';
import { tempHome } from './fixtures/lines';

describe('doctor', () => {
  it('walks a user through a fresh machine', () => {
    const checks = doctor({ paths: resolvePaths(tempHome()), os: 'darwin', env: {}, now: Date.now() });
    expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['helper', 'node', 'browsers', 'statusline', 'statusline-seen', 'rate-limits', 'logs']);
    expect(checks.find((c) => c.id === 'helper')?.detail).toBe('Not installed. Run: npx paceline install');
  });

  it('reports a healthy install', () => {
    const home = tempHome();
    const paths = resolvePaths(home);
    mkdirSync(join(home, 'Library', 'Application Support', 'Google', 'Chrome'), { recursive: true });
    mkdirSync(paths.projectsDir, { recursive: true });
    const self = join(home, 'bundle.cjs');
    writeFileSync(self, '//');
    install({ paths, os: 'darwin', env: {}, selfPath: self, nodePath: process.execPath, extensionIds: ['abcdefghijklmnopabcdefghijklmnop'], registry: noRegistry, now: Date.now });
    const at = Date.now() - 120_000;
    writeJsonAtomic(paths.live, { lastSeenAt: at, capture: { capturedAt: at, sessionId: null, model: null, fiveHour: { usedPct: 42, resetsAt: Date.now() + 1 }, sevenDay: null } });

    const checks = doctor({ paths, os: 'darwin', env: {}, now: Date.now() });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.find((c) => c.id === 'rate-limits')?.detail).toBe('5h 42%, captured 2 min ago');
    expect(formatChecks(checks)).toContain(`✓ ${'browsers'.padEnd(16)} Registered for Chrome`);
  });
});
