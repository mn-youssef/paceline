// Renders docs/images/popup.png and docs/images/dashboard.png from the built extension, fed with made-up data
// through the e2e fake helper. Run: pnpm --filter @paceline/extension screenshots (PACELINE_E2E_CHROME as for e2e).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type BrowserContext } from '@playwright/test';
import { launchWithFakeHelper } from './fake-data';

const OUT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'docs', 'images');
let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, extensionId } = await launchWithFakeHelper());
  mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(async () => {
  await context.close();
});

test('popup', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByText('web-app').waitFor();
  await page.getByText('full ≈').waitFor();
  await page.screenshot({ path: join(OUT_DIR, 'popup.png') });
});

test('dashboard', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await page.getByRole('tab', { name: 'Last 30 days' }).click();
  await page.locator('.value-card .value').waitFor();
  await page.screenshot({ path: join(OUT_DIR, 'dashboard.png'), fullPage: true });
});
