import { test, expect } from '@playwright/test';
import { GEMMA_NANO_E2E_PATH, installE2eConsole } from './e2e.js';

test.describe('Gemma Nano Alignment', () => {
  test('red dot and live pointer are exactly aligned', async ({ page, baseURL }) => {
    installE2eConsole(page);

    // 1. Inject Mock Prompt API before page loads
    await page.addInitScript(() => {
      const mockSession = {
        prompt: async () => '{"action": "CLICK", "position": [0.8, 0.8]}',
        capabilities: async () => ({ available: 'readily' }),
        destroy: () => {},
      };
      const mockAi = {
        languageModel: {
          create: async () => mockSession,
          capabilities: async () => ({ available: 'readily' }),
          availability: async () => 'available',
        }
      };
      window.ai = mockAi;
      window.LanguageModel = mockAi.languageModel;
      console.info('[e2e:mock-ai] Injected window.ai');
    });

    const url = new URL(GEMMA_NANO_E2E_PATH, baseURL || 'http://127.0.0.1:5173');
    url.searchParams.set('e2e', '1');
    
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });

    // 2. Wait for boot
    await page.waitForSelector('#hero-status', { timeout: 15_000 });
    
    await expect.poll(async () => {
      const text = await page.locator('#hero-status').textContent();
      if (text?.includes('Error')) throw new Error(`Boot Error: ${text}`);
      return text;
    }, { timeout: 30_000 }).toContain('ready to run');

    // 3. Fill the prompt and click Run
    await page.locator('#prompt').fill('click something');
    await page.getByTestId('btn-run').click();

    // 4. Wait for execution to finish
    await expect(page.getByTestId('raw-output')).toContainText('Parsed actions', { timeout: 20_000 });
    
    // 5. Check Red Dot (Marker) Position on Screenshot
    const markerPos = await page.evaluate(() => {
      const marker = document.getElementById('click-marker');
      const img = document.getElementById('screenshot-img');
      if (!marker || !img) return null;
      const mRect = marker.getBoundingClientRect();
      const iRect = img.getBoundingClientRect();
      return {
        x: (mRect.left + mRect.width / 2 - iRect.left) / iRect.width,
        y: (mRect.top + mRect.height / 2 - iRect.top) / iRect.height,
      };
    });

    console.log('Marker Norm Pos:', markerPos);
    expect(markerPos).not.toBeNull();
    expect(markerPos.x).toBeCloseTo(0.8, 1);
    expect(markerPos.y).toBeCloseTo(0.8, 1);

    // 6. Check Live Pointer Position
    // We switch back to 'live' viewport to see the pointer
    await page.evaluate(() => { document.body.dataset.viewport = 'live'; });
    
    const pointerPos = await page.evaluate(() => {
      const cursor = document.getElementById('live-cursor');
      const frame = document.getElementById('browse-frame');
      const root = frame.contentDocument?.getElementById('capture-target');
      if (!cursor || !frame || !root) return null;
      
      const cRect = cursor.getBoundingClientRect();
      const rRect = root.getBoundingClientRect(); // relative to iframe viewport
      const fRect = frame.getBoundingClientRect(); // frame on the main page
      
      // Hotspot correction (pointer hotspot is at 9,5)
      const hx = 9;
      const hy = 5;
      
      return {
        x: (cRect.left + hx - fRect.left - rRect.left) / rRect.width,
        y: (cRect.top + hy - fRect.top - rRect.top) / rRect.height,
      };
    });

    console.log('Pointer Norm Pos:', pointerPos);
    expect(pointerPos).not.toBeNull();
    expect(pointerPos.x).toBeCloseTo(0.8, 1);
    expect(pointerPos.y).toBeCloseTo(0.8, 1);
    
    // 7. Assert "Exact" Alignment (within 2% tolerance)
    const dist = Math.hypot(markerPos.x - pointerPos.x, markerPos.y - pointerPos.y);
    console.log('Distance between Marker and Pointer:', dist);
    expect(dist).toBeLessThan(0.02);
  });
});
