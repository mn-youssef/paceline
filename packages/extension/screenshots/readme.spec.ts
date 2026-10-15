// Renders docs/images/popup.png and docs/images/dashboard.png from the built extension, fed with made-up data
// through the e2e fake helper. Run: pnpm --filter @paceline/extension screenshots (PACELINE_E2E_CHROME as for e2e).
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, test, type BrowserContext } from '@playwright/test';
import type { DashboardSession, SessionSummary, Tip } from '@paceline/shared';
import { emptyTools, makeDashboard, makeHiddenCosts, makeSnapshot, makeSummary } from '@paceline/shared/fixtures';

const here = fileURLToPath(new URL('.', import.meta.url));
const EXT_DIR = join(here, '..', '.output', 'chrome-mv3');
const FAKE_HOST = join(here, '..', 'e2e', 'fake-host.mjs');
const OUT_DIR = join(here, '..', '..', '..', 'docs', 'images');
const EXTENSION_ID = (JSON.parse(readFileSync(join(here, '..', '..', 'shared', 'src', 'extension-ids.json'), 'utf8')) as { dev: string }).dev;
const HOST_NAME = 'com.paceline.host';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
};
// Deterministic "noise" so the images are the same on every run.
const wave = (i: number, k: number) => (Math.sin(i * 1.7 + k * 2.3) + 1) / 2;

const tip = (ruleId: string, severity: Tip['severity'], title: string, message: string, evidence: Tip['evidence'], estSavingUsd: number): Tip => ({
  ruleId,
  severity,
  title,
  message,
  evidence,
  estSavingUsd,
});

function session(o: Partial<SessionSummary> & { projectName: string; agoMin: number }): SessionSummary {
  const { agoMin, ...rest } = o;
  return makeSummary({
    projectPath: `/home/dev/${o.projectName}`,
    endedAt: now - agoMin * MIN,
    startedAt: now - agoMin * MIN - (o.durationMin ?? 60) * MIN,
    costUsd: o.windowCostUsd,
    tools: emptyTools(),
    ...rest,
  });
}

const topSessions: SessionSummary[] = [
  session({
    sessionId: 'a',
    projectName: 'web-app',
    agoMin: 4,
    durationMin: 132,
    turns: 86,
    windowCostUsd: 9.42,
    models: { 'claude-opus-5-5': 7.1, 'claude-sonnet-5-5': 2.32 },
    score: 61,
    grade: 'C',
    tips: [
      tip('long-session', 'warn', 'Long session without /clear', 'This session ran 2.2h without /clear. Long context (118k tokens) gets re-sent on every message.', { hours: 2.2, medianContext: 118_000, turns: 86 }, 1.85),
      tip('big-reads', 'info', 'Large file reads', '58% of tool tokens were file reads (largest: routes.ts, 21k tokens). Point Claude to specific files or line ranges.', { readShare: 58, largestFile: 'src/routes.ts' }, 0.94),
    ],
  }),
  session({
    sessionId: 'b',
    projectName: 'api-server',
    agoMin: 38,
    durationMin: 55,
    turns: 42,
    windowCostUsd: 5.1,
    models: { 'claude-sonnet-5-5': 4.6, 'claude-haiku-5-5': 0.5 },
    score: 78,
    grade: 'B',
    tips: [tip('mcp-heavy', 'info', 'Heavy MCP tool output', "The github MCP server returned 64k tokens. Disable servers you don't need in this project.", { server: 'github', outputTokens: 64_000 }, 0.62)],
  }),
  session({
    sessionId: 'c',
    projectName: 'mobile',
    agoMin: 95,
    durationMin: 80,
    turns: 37,
    windowCostUsd: 3.85,
    models: { 'claude-opus-5-5': 1.2, 'claude-sonnet-5-5': 2.65 },
    score: 91,
    grade: 'A',
  }),
  session({
    sessionId: 'd',
    projectName: 'infra',
    agoMin: 150,
    durationMin: 40,
    turns: 22,
    windowCostUsd: 2.4,
    models: { 'claude-sonnet-5-5': 2.4 },
    score: 48,
    grade: 'D',
    tips: [
      tip('noisy-bash', 'warn', 'Noisy command output', '6 commands dumped 41k tokens of output. Pipe long logs through tail or grep.', { commands: 6, tokens: 41_000 }, 0.71),
      tip('cache-miss', 'info', 'Cache expired during pauses', 'You paused 4 times; each restart re-sent ~52k tokens. /clear before long breaks, or keep pauses under 5 min.', { pauses: 4 }, 0.38),
    ],
  }),
  session({ sessionId: 'e', projectName: 'docs-site', agoMin: 210, durationMin: 25, turns: 18, windowCostUsd: 1.12, models: { 'claude-sonnet-5-5': 1.12 }, score: 96, grade: 'A' }),
];

const projects = ['web-app', 'api-server', 'mobile', 'infra', 'docs-site', 'design-system', 'cli-tools'];
const weights = [1, 0.75, 0.55, 0.35, 0.25, 0.18, 0.12];
const days = Array.from({ length: 30 }, (_, i) => {
  const t = daysAgo(29 - i);
  const weekday = new Date(t).getDay();
  const scale = weekday === 0 || weekday === 6 ? 0.25 : 1;
  const byProject: Record<string, number> = {};
  projects.forEach((p, k) => {
    const usd = Math.round(scale * weights[k]! * (6 + 10 * wave(i, k)) * 100) / 100;
    if (usd >= 0.3) byProject[p] = usd;
  });
  const costUsd = Object.values(byProject).reduce((s, c) => s + c, 0);
  return { day: dayKey(t), costUsd, sessions: Object.keys(byProject).length, byProject };
});

const heatmap = Array.from({ length: 7 }, (_, weekday) =>
  Array.from({ length: 24 }, (_, hour) => {
    const workday = weekday >= 1 && weekday <= 5;
    const busy = hour >= 9 && hour <= 18 && hour !== 13 ? 1 : hour >= 20 && hour <= 22 ? 0.45 : 0;
    return Math.round((workday ? 1 : 0.2) * busy * (2 + 4 * wave(weekday * 24 + hour, 3)) * 100) / 100;
  }),
);

const tipRef = (ruleId: string, title: string) => ({ ruleId, title });
const row = (o: Partial<DashboardSession> & { projectName: string; daysBack: number }): DashboardSession => {
  const { daysBack, ...rest } = o;
  const startedAt = daysAgo(daysBack) - 2 * HOUR;
  return {
    sessionId: `${o.projectName}-${daysBack}`,
    startedAt,
    endedAt: startedAt + (o.durationMin ?? 60) * MIN,
    durationMin: 60,
    turns: 40,
    costUsd: 5,
    score: 80,
    grade: 'B',
    tips: [],
    ...rest,
  };
};
const sessions: DashboardSession[] = [
  row({ projectName: 'web-app', daysBack: 2, durationMin: 184, turns: 121, costUsd: 18.6, score: 58, grade: 'C', tips: [tipRef('long-session', 'Long session without /clear'), tipRef('long-context', 'Running at very long context')] }),
  row({ projectName: 'api-server', daysBack: 5, durationMin: 142, turns: 96, costUsd: 14.2, score: 74, grade: 'B', tips: [tipRef('mcp-heavy', 'Heavy MCP tool output')] }),
  row({ projectName: 'web-app', daysBack: 0, durationMin: 132, turns: 86, costUsd: 9.42, score: 61, grade: 'C', tips: [tipRef('long-session', 'Long session without /clear'), tipRef('big-reads', 'Large file reads')] }),
  row({ projectName: 'mobile', daysBack: 8, durationMin: 95, turns: 64, costUsd: 8.75, score: 88, grade: 'A' }),
  row({ projectName: 'infra', daysBack: 12, durationMin: 70, turns: 41, costUsd: 6.3, score: 47, grade: 'D', tips: [tipRef('noisy-bash', 'Noisy command output'), tipRef('cache-miss', 'Cache expired during pauses')] }),
  row({ projectName: 'design-system', daysBack: 3, durationMin: 66, turns: 38, costUsd: 4.9, score: 82, grade: 'B', tips: [tipRef('re-reads', 'Same file read repeatedly')] }),
  row({ projectName: 'docs-site', daysBack: 1, durationMin: 25, turns: 18, costUsd: 1.12, score: 96, grade: 'A' }),
];

const dashboard = makeDashboard({
  range: '30d',
  days,
  byModel: { 'claude-opus-5-5': 268, 'claude-sonnet-5-5': 131, 'claude-haiku-5-5': 13 },
  byCategory: { read: 1_900_000, edit: 610_000, bash: 820_000, search: 340_000, web: 60_000, mcp: 290_000, agent: 180_000, other: 20_000 },
  heatmap,
  monthToDateUsd: 412,
  sessions,
});

const snapshot = {
  ...makeSnapshot({
    live: {
      lastSeenAt: now,
      capture: { capturedAt: now, sessionId: null, model: 'claude-opus-5-5', fiveHour: { usedPct: 62, resetsAt: 0 }, sevenDay: { usedPct: 38, resetsAt: 0 } },
    },
    topSessions,
    totals: {
      ...makeSnapshot().totals,
      costUsd: topSessions.reduce((sum, x) => sum + x.windowCostUsd, 0),
      sessions: topSessions.length,
      byModel: { 'claude-opus-5-5': 8.3, 'claude-sonnet-5-5': 13.09, 'claude-haiku-5-5': 0.5 },
    },
    hiddenCosts: makeHiddenCosts(),
  }),
  dashboard,
};

// A pace history so the gauges show a forecast: the 5-hour limit climbing fast, the weekly one slowly.
function readings() {
  const out = [];
  for (let m = 360; m >= 2; m -= m > 45 ? 30 : 5) {
    const recent = m <= 45;
    out.push({
      t: now - m * MIN,
      fiveHour: { pct: recent ? 60 - (m / 45) * 16 : 30, resetsAt: now + 2 * HOUR },
      sevenDay: { pct: 37.9 - (m / 360) * 3.9, resetsAt: now + 72 * HOUR },
    });
  }
  return out;
}

// Daily budget history: a 6-day streak, a day off, and one day over budget before it.
const dailyUsage: Record<string, number> = {};
[9, 12, 10, 0, 13, 8, 11, 18, 9, 12, 7, 0, 0, 15, 11, 10, 13, 9, 0, 0, 12, 16, 10, 8, 11, 13, 0, 0, 9, 10].forEach((pct, i) => {
  if (pct > 0) dailyUsage[dayKey(daysAgo(i))] = pct;
});

let context: BrowserContext;

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'paceline-shots-'));
  writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
  const launcher = join(dir, 'fake-host.sh');
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HOST}" "${join(dir, 'snapshot.json')}"\n`);
  chmodSync(launcher, 0o755);
  const profile = join(dir, 'profile');
  mkdirSync(join(profile, 'NativeMessagingHosts'), { recursive: true });
  writeFileSync(
    join(profile, 'NativeMessagingHosts', `${HOST_NAME}.json`),
    JSON.stringify({ name: HOST_NAME, description: 'Paceline screenshots fake host', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] }),
  );
  const executablePath = process.env.PACELINE_E2E_CHROME;
  context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    colorScheme: 'light',
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Let the first refresh finish, then seed the history it would have built up over time.
  await worker.evaluate(() => new Promise((r) => setTimeout(r, 1_500)));
  await worker.evaluate(
    ([r, d]) => (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> } } } }).chrome.storage.local.set({ readings: r, dailyUsage: d }),
    [readings(), dailyUsage] as const,
  );
  mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(async () => {
  await context.close();
});

test('popup', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  await page.getByText('web-app').waitFor();
  await page.getByText('full ≈').waitFor();
  await page.screenshot({ path: join(OUT_DIR, 'popup.png') });
});

test('dashboard', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`chrome-extension://${EXTENSION_ID}/dashboard.html`);
  await page.getByRole('tab', { name: 'Last 30 days' }).click();
  await page.getByText('This month').waitFor();
  await page.screenshot({ path: join(OUT_DIR, 'dashboard.png'), fullPage: true });
});
