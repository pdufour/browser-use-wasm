#!/usr/bin/env node
/**
 * Dev smoke for ShowUI UI Navigation mode (btn-task): real Chrome, real UI.
 *
 *   node tests/smoke/nav-smoke.mjs "type my name paul in email field"
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureModelLoaded,
  dismissCoachOverlay,
  loadTimeoutMsForModel,
  waitForBrowseFixtureReady,
  runCaptureUntilReady,
} from '../e2e/e2e.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = process.env.NAV_SMOKE_PORT ?? '5175';
const BASE = `http://127.0.0.1:${PORT}`;
const MODEL_ID = process.env.E2E_MODEL ?? 'ShowUI-2B';
const TASK = process.argv[2] ?? 'type my name paul in email field';
const HEADED = process.env.NAV_SMOKE_HEADED === '1';

async function ensureDevServer() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    if (r.ok) return null;
  } catch {
    /* spawn */
  }
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', PORT], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return child;
    } catch {
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  child.kill();
  throw new Error(`Dev server did not start at ${BASE}`);
}

const vite = await ensureDevServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !HEADED,
  args: ['--enable-unsafe-webgpu'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1728, height: 1494 } });
  page.on('console', (msg) => {
    const t = msg.text();
    if (/\[(worker|main):(navigation|grounding|intent)\]|\[browser-actions\]|error/i.test(t)) {
      console.log(`[browser] ${t.slice(0, 300)}`);
    }
  });
  page.setDefaultTimeout(120_000);

  await page.goto(`${BASE}/?model=${MODEL_ID}`, { waitUntil: 'domcontentloaded' });
  await dismissCoachOverlay(page);
  await page.waitForSelector('[data-testid="browse-frame"]', { timeout: 15_000 });
  await waitForBrowseFixtureReady(page);
  try {
    await ensureModelLoaded(page, MODEL_ID, loadTimeoutMsForModel(MODEL_ID));
  } catch (err) {
    await page.screenshot({ path: '/tmp/nav-smoke-fail.png', fullPage: true });
    throw err;
  }
  console.log('[smoke] model loaded — capturing');

  await runCaptureUntilReady(page);
  console.log('[smoke] captured — running task:', JSON.stringify(TASK));

  await page.locator('#prompt').fill(TASK);
  await page.waitForFunction(() => !document.getElementById('btn-task')?.disabled);
  await page.getByTestId('btn-task').click();

  await page.waitForFunction(
    () => /Parsed actions?:|Error:|Could not parse/.test(document.getElementById('raw-output')?.textContent ?? ''),
    undefined,
    { timeout: 30_000 }
  );
  const rawOut = await page.locator('#raw-output').textContent();
  console.log('\n--- raw-output ---\n' + rawOut + '\n------------------');

  const fieldReport = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="browse-frame"]');
    const doc = frame?.contentDocument;
    if (!doc) return ['(no browse frame)'];
    const out = [];
    for (const el of doc.querySelectorAll('input, textarea')) {
      out.push(
        `${el.tagName.toLowerCase()}#${el.id || '?'}[type=${el.type}] ` +
          `label="${doc.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ?? ''}" value="${el.value}"`
      );
    }
    return out.length ? out : ['(no inputs)'];
  });
  console.log(`[smoke] live fields with values:\n  ${fieldReport.join('\n  ')}`);

  const probe = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="browse-frame"]');
    const doc = frame?.contentDocument;
    const root = doc?.querySelector('#capture-target');
    if (!root) return '(no capture target)';
    const rect = root.getBoundingClientRect();
    const out = [];
    for (const el of doc.querySelectorAll('input, textarea')) {
      const r = el.getBoundingClientRect();
      const nx = ((r.left + r.right) / 2 - rect.left) / rect.width;
      const ny = ((r.top + r.bottom) / 2 - rect.top) / rect.height;
      out.push(
        `${el.tagName.toLowerCase()}[type=${el.type}] center=(${nx.toFixed(3)}, ${ny.toFixed(3)}) ` +
          `span x[${((r.left - rect.left) / rect.width).toFixed(3)}..${((r.right - rect.left) / rect.width).toFixed(3)}] ` +
          `y[${((r.top - rect.top) / rect.height).toFixed(3)}..${((r.bottom - rect.top) / rect.height).toFixed(3)}]`
      );
    }
    return out.join('\n  ');
  });
  console.log(`[smoke] field rects in capture-norm space:\n  ${probe}`);

  const geom = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="browse-frame"]');
    const doc = frame?.contentDocument;
    const root = doc?.querySelector('#capture-target');
    const img = document.getElementById('screenshot-img');
    const rect = root?.getBoundingClientRect();
    const scroller = root
      ? [...root.querySelectorAll('*')].find(
          (el) => el.scrollHeight > el.clientHeight + 1
        )
      : null;
    return {
      rect: rect ? `${rect.width.toFixed(1)}x${rect.height.toFixed(1)}` : null,
      rootScroll: root ? `${root.scrollWidth}x${root.scrollHeight}` : null,
      innerScroller: scroller
        ? `${scroller.tagName}.${scroller.className} client=${scroller.clientHeight} scroll=${scroller.scrollHeight} top=${scroller.scrollTop}`
        : '(none)',
      screenshot: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
      dpr: window.devicePixelRatio,
    };
  });
  console.log(`[smoke] geometry: ${JSON.stringify(geom, null, 2)}`);

  const shotInfo = await page.evaluate(() => {
    const el = document.getElementById('screenshot-img');
    if (!el) return null;
    if (el.tagName === 'CANVAS') {
      return { kind: 'canvas', w: el.width, h: el.height, dataUrl: el.toDataURL('image/png') };
    }
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    c.getContext('2d').drawImage(el, 0, 0);
    return { kind: 'img', w: c.width, h: c.height, dataUrl: c.toDataURL('image/png') };
  });
  if (shotInfo) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('/tmp/nav-smoke-shot.png', Buffer.from(shotInfo.dataUrl.split(',')[1], 'base64'));
    console.log(`[smoke] screenshot ${shotInfo.kind} ${shotInfo.w}x${shotInfo.h} → /tmp/nav-smoke-shot.png`);
  }
  await page.screenshot({ path: '/tmp/nav-smoke-after.png' });

  const markerVisible = await page.evaluate(() => {
    const m = document.getElementById('click-marker');
    return !!m && m.style.display !== 'none';
  });
  console.log(`[smoke] marker visible: ${markerVisible}`);
} finally {
  await browser.close();
  vite?.kill();
}
