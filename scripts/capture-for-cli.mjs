/** Save the same SnapDOM capture the app uses (needs dev server on :5173). */
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '../.tmp/showui-capture.png');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/home/');
await page.waitForFunction(() => {
  const t = document.getElementById('model-status')?.textContent ?? '';
  return t.includes('WebGPU ready') || t.includes('loaded');
}, { timeout: 120_000 });
await page.getByTestId('btn-capture').click();
await page.waitForFunction(() => {
  const t = document.getElementById('model-status')?.textContent ?? '';
  return t.includes('Captured');
}, { timeout: 60_000 });
const img = page.locator('#screenshot-img');
await img.screenshot({ path: out });
const dims = await page.evaluate(() => {
  const el = document.getElementById('screenshot-img');
  return { w: el?.naturalWidth, h: el?.naturalHeight };
});
console.log('saved', out, dims);
await browser.close();
