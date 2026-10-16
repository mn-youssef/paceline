import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { makeDashboard, makeDashboardProject, makeDashboardSession, makeHiddenCosts, makeSnapshot, makeSummary, makeTip } from '@paceline/shared/fixtures';

const here = fileURLToPath(new URL('.', import.meta.url));
const EXT_DIR = join(here, '..', '.output-test', 'chrome-mv3');
const FAKE_HOST = join(here, 'fake-host.mjs');
// Read directly: Node's ESM loader (used by Playwright) needs import attributes for JSON modules.
const DEV_EXTENSION_ID = (JSON.parse(readFileSync(join(here, '..', '..', 'shared', 'src', 'extension-ids.json'), 'utf8')) as { dev: string }).dev;
const HOST_NAME = 'com.paceline.host'; // same value as HOST_NAME in @paceline/shared

let context: BrowserContext;

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'paceline-e2e-'));
  const snapshotPath = join(userDataDir, 'snapshot.json');
  writeFileSync(
    snapshotPath,
    JSON.stringify({
      ...makeSnapshot({
        live: {
          lastSeenAt: 0,
          capture: { capturedAt: 0, sessionId: null, model: 'claude-opus-5-5', fiveHour: { usedPct: 85, resetsAt: 0 }, sevenDay: { usedPct: 18, resetsAt: 0 } },
        },
        topSessions: [makeSummary({ tips: [makeTip()] })],
        hiddenCosts: makeHiddenCosts(),
        totals: { ...makeSnapshot().totals, costUsd: 4.2, sessions: 1 },
      }),
      dashboard: makeDashboard({
        monthToDateUsd: 412,
        days: [{ day: '2026-10-12', costUsd: 3.2, sessions: 1, byProject: { 'my-app': 3.2 } }],
        byModel: { 'claude-opus-5-5': 3.2 },
        sessions: [makeDashboardSession({ costUsd: 3.2 })],
        projects: [makeDashboardProject()],
      }),
    }),
  );
  const launcher = join(userDataDir, 'fake-host.sh');
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_HOST}" "${snapshotPath}"\n`);
  chmodSync(launcher, 0o755);
  const hostsDir = join(userDataDir, 'NativeMessagingHosts');
  mkdirSync(hostsDir, { recursive: true });
  writeFileSync(
    join(hostsDir, `${HOST_NAME}.json`),
    JSON.stringify({ name: HOST_NAME, description: 'Paceline e2e fake host', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${DEV_EXTENSION_ID}/`] }),
  );
  // PACELINE_E2E_CHROME points at any Chromium / Chrome for Testing binary when Playwright's own download is unavailable.
  // Branded Google Chrome ignores --load-extension, so it cannot be used here.
  const executablePath = process.env.PACELINE_E2E_CHROME;
  context = await chromium.launchPersistentContext(userDataDir, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
});

test.afterAll(async () => {
  await context.close();
});

async function worker(): Promise<Worker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

test('loads with the pinned development id', async () => {
  expect(new URL((await worker()).url()).host).toBe(DEV_EXTENSION_ID);
});

test('badge shows the 5-hour percentage in red', async () => {
  const sw = await worker();
  await expect.poll(() => sw.evaluate(() => (globalThis as any).chrome.action.getBadgeText({})), { timeout: 15_000 }).toBe('85');
  expect(await sw.evaluate(() => (globalThis as any).chrome.action.getBadgeBackgroundColor({}))).toEqual([220, 38, 38, 255]);
});

test('records the threshold alerts it sent', async () => {
  const sw = await worker();
  await expect
    .poll(() => sw.evaluate(async () => ((await (globalThis as any).chrome.storage.local.get('alerts')).alerts?.['5h']?.fired ?? []) as number[]))
    .toEqual([50, 80]);
});

test('popup lists top sessions with tips', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/popup.html`);
  await expect(page.getByText('my-app')).toBeVisible();
  await expect(page.getByText('Long session without /clear')).toBeVisible();
  await expect(page.getByRole('img', { name: '5-hour limit: 85% used' })).toBeVisible();
});

test('celebration page renders', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/celebrate.html`);
  await expect(page.getByRole('heading', { name: 'Fresh limit!' })).toBeVisible();
});

test('popup body text uses the 13px base size, not Chrome extension pages default 75%', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/popup.html`);
  await expect(page.getByText('my-app')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('13px');
});

test('hidden costs tab lists the biggest likely saving first', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/popup.html`);
  await page.getByRole('tab', { name: 'Hidden costs' }).click();
  await expect(page.locator('.hc-title').first()).toHaveText('Long context');
  await expect(page.getByText('Subagents used 34% of this window.')).toBeVisible();
  await expect(page.getByText('Most from: my-app $3.10')).toBeVisible();
});

test('dashboard renders the helper data', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/dashboard.html`);
  await expect(page.getByText('This month: $412 of API value on your $100 plan (4.1×)')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'my-app' }).first()).toBeVisible();
  await expect(page.locator('.legend')).toContainText('my-app');
});

test('popup opens the dashboard in a tab', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/popup.html`);
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  const tab = await opened;
  await tab.waitForLoadState();
  expect(tab.url()).toBe(`chrome-extension://${DEV_EXTENSION_ID}/dashboard.html`);
});

test('budget input saves only when you leave the field', async () => {
  const sw = await worker();
  const stored = () =>
    sw.evaluate(async () => ((await (globalThis as any).chrome.storage.local.get('settings')).settings?.dailyBudgetPct ?? null) as number | null);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/options.html`);
  const input = page.getByRole('spinbutton', { name: /Daily budget/ });
  await input.fill('');
  await input.pressSequentially('2');
  expect(await stored()).not.toBe(2);
  await input.pressSequentially('0');
  await input.blur();
  await expect.poll(stored).toBe(20);
  await input.fill('');
  await input.blur();
  await expect(input).toHaveValue('20');
  expect(await stored()).toBe(20);
});

for (const scheme of ['light', 'dark'] as const)
for (const [path, ready] of [
  ['popup.html', 'my-app'],
  ['options.html', 'Paceline options'],
  ['dashboard.html', 'This month'],
] as const) {
  test(`no serious accessibility problems on ${path} (${scheme})`, async () => {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/${path}`);
    await expect(page.getByText(ready).first()).toBeVisible();
    const serious = (await new AxeBuilder({ page }).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(serious).toEqual([]);
  });
}

test('dashboard lists projects with their tokens', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${DEV_EXTENSION_ID}/dashboard.html`);
  const projects = page.locator('.projects-card');
  await expect(projects.locator('.project-name', { hasText: 'my-app' })).toBeVisible();
  await expect(projects.locator('.project-value')).toHaveText('$3.20');
  await expect(projects.locator('.token-total')).toHaveText('2.3M');
  await expect(projects.getByRole('img', { name: 'my-app: input 1k, output 20k, cache write 300k, cache read 2M, total 2.3M' })).toBeVisible();
});
