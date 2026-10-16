// Renders the Chrome Web Store images into docs/store/: three 1280×800 screenshots and the 440×280 promo tile,
// from the built extension with made-up data. Run: pnpm --filter @paceline/extension screenshots
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { launchWithFakeHelper } from './fake-data';

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(here, '..', '..', '..', 'docs', 'store');
const ICON = readFileSync(join(here, '..', 'public', 'icon', '128.png')).toString('base64');
let context: BrowserContext;
let extensionId: string;

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

async function save(page: Page, name: string, size: { width: number; height: number }) {
  const png = await page.screenshot();
  expect(pngSize(png)).toEqual(size);
  writeFileSync(join(OUT_DIR, name), png);
}

/** The popup next to a headline, on the brand's dark background. */
async function popupShot(name: string, headline: string, subline: string, prepare?: (popup: Page) => Promise<void>) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText('web-app').waitFor();
  await popup.getByText('full ≈').waitFor();
  await prepare?.(popup);
  const shot = (await popup.screenshot()).toString('base64');
  await popup.close();

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;
    background:linear-gradient(135deg,#1c1917,#431407);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff">
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px"><img src="data:image/png;base64,${ICON}" width="48" height="48"><span style="font-size:28px;font-weight:700">Paceline</span></div>
      <h1 style="font-size:52px;line-height:1.1;margin:0 0 20px">${headline}</h1>
      <p style="font-size:24px;line-height:1.4;margin:0;color:#d6d3d1">${subline}</p>
    </div>
    <img src="data:image/png;base64,${shot}" width="360" height="600" style="border-radius:16px;box-shadow:0 24px 64px rgb(0 0 0 / .5)">
  </body></html>`);
  await save(page, name, { width: 1280, height: 800 });
  await page.close();
}

test.beforeAll(async () => {
  // The store wants exact pixel sizes, so everything renders at 1×.
  ({ context, extensionId } = await launchWithFakeHelper({ deviceScaleFactor: 1 }));
  mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(async () => {
  await context.close();
});

test('screenshot 1: popup', async () => {
  await popupShot('screenshot-1-popup.png', 'See your Claude Code limit at a glance', "Live 5-hour and weekly usage, a forecast, and today's budget.");
});

test('screenshot 2: dashboard', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await page.getByRole('tab', { name: 'Last 30 days' }).click();
  await page.locator('.value-card .value').waitFor();
  await save(page, 'screenshot-2-dashboard.png', { width: 1280, height: 800 });
  await page.close();
});

test('screenshot 3: hidden costs', async () => {
  await popupShot('screenshot-3-hidden-costs.png', "Find the costs you don't see", 'Cache misses, setup overhead, subagents and long context, with the projects behind them.', async (popup) => {
    await popup.getByRole('tab', { name: 'Hidden costs' }).click();
    await popup.locator('.hc-title').first().waitFor();
  });
});

test('promo tile', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    background:#1c1917;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff;border-bottom:6px solid #ea580c;box-sizing:border-box">
    <img src="data:image/png;base64,${ICON}" width="88" height="88">
    <div style="font-size:40px;font-weight:800;letter-spacing:-0.5px">Paceline</div>
    <div style="font-size:18px;color:#fdba74">Usage meter for Claude Code</div>
  </body></html>`);
  await save(page, 'promo-tile-440x280.png', { width: 440, height: 280 });
  await page.close();
});
